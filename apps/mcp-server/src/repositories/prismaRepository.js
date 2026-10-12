import { Prisma } from "@prisma/client";
import { AppError, forbidden } from "../errors.js";

export class PrismaRepository {
  constructor(prisma) {
    this.prisma = prisma;
    this.resolvedUsers = new Map();
  }

  async withUserLock(externalUserId, operation) {
    const user = await this.user(externalUserId);
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
          const repository = new PrismaRepository(transaction);
          repository.resolvedUsers.set(externalUserId, user);
          return operation(repository);
        },
        { maxWait: 15_000, timeout: 60_000 },
      );
    } catch (error) {
      throw databaseError(error);
    }
  }

  async createProposal(externalUserId, input) {
    const user = await this.user(externalUserId);
    return mapDates(
      await this.prisma.rehearseProposal.create({
        data: {
          userId: user.id,
          scenarioId: input.scenarioId,
          goal: input.goal,
          status: input.status ?? "DRAFT",
          version: input.version ?? 1,
          routine: json(input.routine),
          microTwin: json(input.microTwin),
          context: json(input.context),
        },
      }),
    );
  }

  // Reuse the existing per-user JSON preference table; no migration or legacy
  // table replacement is needed for configurable household profiles.
  async listHouseholds(externalUserId) {
    const user = await this.user(externalUserId);
    const rows = await this.prisma.userPreference.findMany({
      where: { userId: user.id, key: { startsWith: "rehearse.household." } },
    });
    return rows.map((row) => row.value);
  }
  async saveHousehold(externalUserId, profile) {
    const user = await this.user(externalUserId);
    const key = `rehearse.household.${profile.id}`;
    const row = await this.prisma.userPreference.upsert({
      where: { userId_key: { userId: user.id, key } },
      create: {
        userId: user.id,
        key,
        value: json(profile),
        source: "explicit",
      },
      update: { value: json(profile), source: "explicit" },
    });
    return row.value;
  }

  async getProposal(externalUserId, id) {
    const user = await this.user(externalUserId);
    const row = await this.prisma.rehearseProposal.findFirst({
      where: { id, userId: user.id },
    });
    if (!row) throw forbidden();
    return mapDates(row);
  }
  async listProposals(externalUserId, limit = 30) {
    const user = await this.user(externalUserId);
    return (
      await this.prisma.rehearseProposal.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: limit,
      })
    ).map(mapDates);
  }
  async latestSimulation(externalUserId, proposalId, version) {
    const user = await this.user(externalUserId);
    await this.assertProposal(user.id, proposalId);
    return mapDates(
      await this.prisma.rehearseSimulation.findFirst({
        where: { userId: user.id, proposalId, proposalVersion: version },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  async updateProposal(externalUserId, id, patch) {
    const user = await this.user(externalUserId);
    const result = await this.prisma.rehearseProposal.updateMany({
      where: { id, userId: user.id },
      data: {
        status: patch.status,
        version: patch.version,
        routine: patch.routine === undefined ? undefined : json(patch.routine),
        microTwin:
          patch.microTwin === undefined ? undefined : json(patch.microTwin),
        context: patch.context === undefined ? undefined : json(patch.context),
      },
    });
    if (!result.count) throw forbidden();
    return this.getProposal(externalUserId, id);
  }

  async createSimulation(externalUserId, input) {
    const user = await this.user(externalUserId);
    await this.assertProposal(user.id, input.proposalId);
    return mapDates(
      await this.prisma.rehearseSimulation.create({
        data: {
          userId: user.id,
          proposalId: input.proposalId,
          proposalVersion: input.proposalVersion,
          status: input.status,
          violations: json(input.violations),
          trace: json(input.trace),
          summary: json(input.summary),
        },
      }),
    );
  }

  async createApproval(externalUserId, input) {
    const user = await this.user(externalUserId);
    return mapDates(
      await this.prisma.approval.create({
        data: {
          userId: user.id,
          actionType: input.actionType,
          payloadHash: input.payloadHash,
          status: input.status ?? "PENDING",
          expiresAt: date(input.expiresAt),
        },
      }),
    );
  }

  async getApproval(externalUserId, id) {
    const user = await this.user(externalUserId);
    const row = await this.prisma.approval.findFirst({
      where: { id, userId: user.id },
    });
    if (!row) throw forbidden();
    return mapDates(row);
  }

  async updateApproval(externalUserId, id, patch) {
    const user = await this.user(externalUserId);
    const result = await this.prisma.approval.updateMany({
      where: { id, userId: user.id },
      data: {
        status: patch.status,
        consumedAt:
          patch.consumedAt === undefined ? undefined : date(patch.consumedAt),
      },
    });
    if (!result.count) throw forbidden();
    return this.getApproval(externalUserId, id);
  }

  async createActivation(externalUserId, input) {
    const user = await this.user(externalUserId);
    await this.assertProposal(user.id, input.proposalId);
    try {
      if (input.idempotencyKey) {
        const existing = await this.prisma.rehearseActivation.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: user.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) return mapDates(existing);
      }
      return mapDates(
        await this.prisma.rehearseActivation.create({
          data: {
            userId: user.id,
            proposalId: input.proposalId,
            proposalVersion: input.proposalVersion,
            status: input.status ?? "ACTIVE",
            snapshot: json(input.snapshot),
            runtimeState: json(input.runtimeState),
            idempotencyKey: input.idempotencyKey ?? null,
          },
        }),
      );
    } catch (error) {
      throw databaseError(error);
    }
  }

  async getActivation(externalUserId, id) {
    const user = await this.user(externalUserId);
    const row = await this.prisma.rehearseActivation.findFirst({
      where: { id, userId: user.id },
    });
    if (!row) throw forbidden();
    return mapDates(row);
  }

  async getActivationByIdempotencyKey(externalUserId, idempotencyKey) {
    const user = await this.user(externalUserId);
    const row = await this.prisma.rehearseActivation.findUnique({
      where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
    });
    return mapDates(row);
  }

  async getActiveActivationForProposal(externalUserId, proposalId) {
    const user = await this.user(externalUserId);
    const row = await this.prisma.rehearseActivation.findFirst({
      where: {
        userId: user.id,
        proposalId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return mapDates(row);
  }

  async updateActivation(externalUserId, id, patch) {
    const user = await this.user(externalUserId);
    const result = await this.prisma.rehearseActivation.updateMany({
      where: { id, userId: user.id },
      data: {
        status: patch.status,
        runtimeState:
          patch.runtimeState === undefined
            ? undefined
            : json(patch.runtimeState),
        rolledBackAt:
          patch.rolledBackAt === undefined
            ? undefined
            : date(patch.rolledBackAt),
      },
    });
    if (!result.count) throw forbidden();
    return this.getActivation(externalUserId, id);
  }

  async addAuditEvent(externalUserId, input) {
    const user = await this.user(externalUserId);
    if (input.proposalId) await this.assertProposal(user.id, input.proposalId);
    return mapDates(
      await this.prisma.rehearseAuditEvent.create({
        data: {
          userId: user.id,
          proposalId: input.proposalId ?? null,
          activationId: input.activationId ?? null,
          type: input.type,
          details: json(input.details),
        },
      }),
    );
  }

  async listAuditEvents(externalUserId, proposalId) {
    const user = await this.user(externalUserId);
    return this.prisma.rehearseAuditEvent
      .findMany({
        where: { userId: user.id, ...(proposalId ? { proposalId } : {}) },
        orderBy: { createdAt: "asc" },
      })
      .then((rows) => rows.map(mapDates));
  }

  async assertProposal(userId, id) {
    const row = await this.prisma.rehearseProposal.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw forbidden();
  }
  async user(externalUserId) {
    if (this.resolvedUsers.has(externalUserId))
      return this.resolvedUsers.get(externalUserId);
    // Cache only the authenticated identity-to-primary-key mapping, never
    // proposals, permissions or owner-filtered reads. Every data query still
    // includes userId. Avoid repeated remote upserts within a browser session.
    try {
      const row = await retryConnection(() =>
        this.prisma.user.upsert({
          where: { externalUserId },
          create: { externalUserId },
          update: {},
        }),
      );
      this.resolvedUsers.set(externalUserId, row);
      return row;
    } catch (error) {
      throw databaseError(error);
    }
  }
}

const date = (value) => (value ? new Date(value) : null);
const json = (value) => value;
function mapDates(row) {
  if (!row) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}
async function retryConnection(operation, attempts = 3) {
  let error;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (caught) {
      error = caught;
      if (!isTransient(caught) || attempt === attempts - 1) throw caught;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw error;
}
function isTransient(error) {
  return (
    (typeof Prisma.PrismaClientInitializationError === "function" &&
      error instanceof Prisma.PrismaClientInitializationError) ||
    ["P1001", "P1002", "P1008", "P2024"].includes(error?.code)
  );
}
function databaseError(error) {
  if (error instanceof AppError) return error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return new AppError(
      "CONFLICT",
      "A record with this unique value already exists.",
      { status: 409 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  )
    return forbidden();
  return new AppError(
    "DATABASE_UNAVAILABLE",
    "Persistent storage is temporarily unavailable.",
    { status: 503, retryable: true },
  );
}
