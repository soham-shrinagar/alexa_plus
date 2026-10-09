import { withTimeout } from "../providers/demoProviders.js";
import { AppError } from "../errors.js";
import { executeGraph } from "../workflows/graphExecutor.js";
import { findFreeSlots, hasConflict } from "./schedulingService.js";

const terminalWorkflowStates = new Set(["VERIFIED", "FAILED", "PARTIALLY_COMPLETED", "CANCELLED"]);

export class LifeOpsService {
  constructor({ repository, travelProvider, weatherProvider }) {
    Object.assign(this, { repository, travelProvider, weatherProvider });
  }

  getEvents(userId, range) { return this.repository.getEvents(userId, range); }

  async createEvent(userId, event) {
    const events = await this.getEvents(userId, { startTime: event.startTime, endTime: event.endTime });
    if (hasConflict(events, event.startTime, event.endTime)) {
      throw new AppError("SCHEDULE_CONFLICT", "The requested event overlaps an existing calendar event.", { status: 409 });
    }
    return this.repository.createEvent(userId, event);
  }

  async travel(input) { return withTimeout(() => this.travelProvider.getTravelTime(input)); }
  async weather(input) { return withTimeout(() => this.weatherProvider.getForecast(input)); }

  async scheduleNotification(userId, input) {
    const notification = await this.repository.createNotification(userId, input);
    const verified = await this.repository.getNotification(userId, notification.id);
    if (verified.message !== input.message || verified.scheduledTime !== input.scheduledTime || verified.status !== "CONFIRMED") {
      throw new AppError("VERIFICATION_FAILED", "The reminder was accepted but could not be verified.", { status: 502 });
    }
    return { ...verified, verificationStatus: "VERIFIED" };
  }

  preferences(userId) { return this.repository.getPreferences(userId); }
  updatePreference(userId, key, value) { return this.repository.updatePreference(userId, key, value, "explicit"); }
  listMemories(userId) { return this.repository.listMemories(userId); }
  searchMemories(userId, query, limit) { return this.repository.searchMemories(userId, query, limit); }
  deleteMemory(userId, id) { return this.repository.deleteMemory(userId, id); }

  async freeSlots(userId, input) {
    const events = await this.getEvents(userId, { startTime: input.rangeStart, endTime: input.rangeEnd });
    const preferences = await this.preferences(userId);
    const workingHours = preferences.find((item) => item.key === "workingHours")?.value ?? { start: 9, end: 18 };
    return findFreeSlots({ events, ...input, workingHours });
  }

  async smartCommute(userId, { origin, eventId }) {
    const events = await this.getEvents(userId, {});
    const event = events.find((item) => item.id === eventId) ?? events[0];
    if (!event) throw new AppError("NO_EVENT", "No calendar event is available to plan travel for.", { status: 404 });

    const [travel, weather] = await Promise.all([
      this.travel({ origin, destination: event.location, departureTime: event.startTime }),
      this.weather({ location: event.location, hours: 4 })
    ]);
    const weatherBufferMinutes = weather.forecast.some((point) => point.precipitationChance >= 50) ? 15 : 5;
    const departureTime = new Date(new Date(event.startTime).getTime() - (travel.travelTimeMinutes + weatherBufferMinutes) * 60_000).toISOString();
    return {
      event, travel, weather, weatherBufferMinutes, departureTime,
      recommendation: `Leave at ${departureTime}; this includes ${travel.travelTimeMinutes} minutes of travel and a ${weatherBufferMinutes}-minute weather buffer.`,
      isMock: true,
      freshness: "deterministic-demo",
      verificationStatus: "ESTIMATED"
    };
  }

  async executeCommuteWorkflow(userId, input) {
    if (!input.origin) throw new AppError("CLARIFICATION_REQUIRED", "Please provide the trip origin.", { status: 400 });
    const workflow = await this.repository.createWorkflow(userId, {
      type: "SMART_COMMUTE",
      idempotencyKey: input.idempotencyKey,
      status: "PENDING"
    });
    if (terminalWorkflowStates.has(workflow.status)) {
      return { workflowId: workflow.id, status: workflow.status, results: workflow.steps, reused: true };
    }

    const update = async (stepKey, updateValue) => {
      workflow.steps[stepKey] = { ...(workflow.steps[stepKey] ?? {}), ...updateValue };
      await this.repository.updateWorkflow(userId, workflow.id, {
        currentStep: stepKey,
        steps: workflow.steps,
        status: updateValue.status === "FAILED" ? "FAILED" : "RUNNING"
      });
    };
    const plan = [
      {
        id: "event",
        dependsOn: [],
        run: async () => {
          const events = await this.getEvents(userId, {});
          const event = events.find((item) => item.id === input.eventId) ?? events[0];
          if (!event) throw new AppError("CLARIFICATION_REQUIRED", "No meeting was found. Please specify an event.", { status: 400 });
          return event;
        }
      },
      {
        id: "travel",
        dependsOn: ["event"],
        run: ({ event }) => this.travel({ origin: input.origin, destination: event.value.location, departureTime: event.value.startTime })
      },
      {
        id: "weather",
        dependsOn: ["event"],
        run: ({ event }) => this.weather({ location: event.value.location, hours: 4 })
      },
      {
        id: "departure",
        dependsOn: ["travel", "weather", "event"],
        run: ({ travel, weather, event }) => {
          const buffer = weather.value.forecast.some((point) => point.precipitationChance >= 50) ? 15 : 5;
          return {
            departureTime: new Date(new Date(event.value.startTime).getTime() - (travel.value.travelTimeMinutes + buffer) * 60_000).toISOString(),
            weatherBufferMinutes: buffer
          };
        }
      }
    ];
    if (input.scheduleReminder) {
      plan.push({
        id: "notification",
        dependsOn: ["departure"],
        run: ({ departure }) => this.scheduleNotification(userId, {
          message: input.reminderMessage ?? "Time to leave for your meeting.",
          scheduledTime: departure.value.departureTime,
          idempotencyKey: `${workflow.id}:reminder`
        })
      });
    }

    const result = await executeGraph({ steps: plan, onUpdate: update });
    await this.repository.updateWorkflow(userId, workflow.id, { status: result.status, currentStep: undefined, steps: workflow.steps });
    await this.repository.addMemory(userId, {
      category: "workflow",
      summary: `Smart commute workflow ${result.status}`,
      referenceType: "workflow",
      referenceId: workflow.id,
      source: "system",
      retentionUntil: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    return { workflowId: workflow.id, ...result };
  }
}
