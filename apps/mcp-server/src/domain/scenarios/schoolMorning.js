export const schoolMorningScenario = Object.freeze({
  id: "school-morning",
  name: "Rainy school morning",
  description: "A polished demo fixture for Rehearse's generic household routine engine.",
  household: {
    people: [
      { id: "parent", name: "Parent", roles: ["coordinator", "driver"] },
      { id: "maya", name: "Maya", roles: ["school-child"], preparationMinutes: 35 },
      { id: "baby", name: "Baby", roles: ["sleeping-child"] },
      { id: "guest", name: "Guest", roles: ["guest"] }
    ],
    devices: [
      { id: "water-heater", name: "Water heater", capabilities: ["heat_water"], powerWatts: 2000, location: "bathroom" },
      { id: "kettle", name: "Kettle", capabilities: ["boil_water"], powerWatts: 1500, location: "kitchen" },
      { id: "coffee-machine", name: "Coffee machine", capabilities: ["make_coffee"], powerWatts: 900, location: "kitchen" },
      { id: "hall-speaker", name: "Hall speaker", capabilities: ["announce"], powerWatts: 8, location: "hall" },
      { id: "entry-light", name: "Entry light", capabilities: ["set_light"], powerWatts: 10, location: "entry" },
      { id: "garden-sprinkler", name: "Garden sprinkler", capabilities: ["water_garden"], powerWatts: 120, location: "garden" },
      { id: "bedroom-fan", name: "Bedroom fan", capabilities: ["set_fan"], powerWatts: 50, location: "bedroom" }
    ]
  },
  environment: { weekday: "Friday", weather: { raining: true }, travelDelayMinutes: 0, unavailableCapabilities: [] },
  defaults: {
    departureTime: "07:45",
    quietUntil: "07:00",
    rainyDepartureAdvanceMinutes: 15,
    maxConcurrentPowerWatts: 2600
  },
  // Scenario content stays here; the compiler and verifier consume ordinary actions.
  routineTemplate: {
    title: "Adaptive school-morning routine",
    preparationTargetId: "maya",
    quietTargetId: "baby",
    steps: [
      { id: "heat-water", label: "Heat shower water", targetId: "water-heater", capability: "heat_water", startMinute: 390, durationMinutes: 40, powerWatts: 2000 },
      { id: "morning-announcement", label: "Announce the morning routine", targetId: "hall-speaker", capability: "announce", startMinute: 415, durationMinutes: 2, powerWatts: 8, audible: true },
      { id: "maya-ready", label: "Maya gets ready", targetId: "maya", capability: "prepare_person", startMinute: 420, durationMinutes: 35, requiredForDeparture: true },
      { id: "boil-kettle", label: "Boil water", targetId: "kettle", capability: "boil_water", startMinute: 425, durationMinutes: 7, powerWatts: 1500 },
      { id: "make-coffee", label: "Make coffee", targetId: "coffee-machine", capability: "make_coffee", startMinute: 432, durationMinutes: 6, powerWatts: 900, optional: true },
      { id: "entry-light", label: "Turn on entry light", targetId: "entry-light", capability: "set_light", durationMinutes: 5, powerWatts: 10, relativeToDepartureMinutes: -5 },
      { id: "depart", label: "Leave for school", targetId: "parent", capability: "depart", durationMinutes: 1, departure: true }
    ]
  }
});

export function getScenario(id = "school-morning") {
  if (id !== schoolMorningScenario.id) return undefined;
  return structuredClone(schoolMorningScenario);
}
