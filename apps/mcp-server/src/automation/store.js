import { randomUUID } from "node:crypto";
import { AppError } from "../errors.js";

const conflict = () => new AppError("STALE_REVISION", "The workspace changed. Reload it and repeat this operation.", { status: 409 });

/** Test/local ephemeral store. Persistence is explicit in capabilities. */
export class MemoryAutomationStore {
  mode = "memory";
  accounts = new Map(); workspaces = new Map();
  async account(username) { return structuredClone(this.accounts.get(username) ?? null); }
  async createAccount(data) {
    if (this.accounts.has(data.username)) throw new AppError("ACCOUNT_EXISTS", "Choose another username or sign in.", { status: 409 });
    const account = { id: randomUUID(), ...data }; this.accounts.set(data.username, account); return structuredClone(account);
  }
  async create(ownerId, document) {
    const row = { id: randomUUID(), ownerId, revision: 1, document: structuredClone(document), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.workspaces.set(row.id, row); return structuredClone(row);
  }
  async get(ownerId, id) { const row = this.workspaces.get(id); return row?.ownerId === ownerId ? structuredClone(row) : null; }
  async list(ownerId) { return [...this.workspaces.values()].filter(r => r.ownerId === ownerId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30).map(r => structuredClone(r)); }
  async save(ownerId, id, revision, document) {
    const row = this.workspaces.get(id); if (!row || row.ownerId !== ownerId || row.revision !== revision) throw conflict();
    Object.assign(row, { document: structuredClone(document), revision: revision + 1, updatedAt: new Date().toISOString() }); return structuredClone(row);
  }
}

/** Additive Neon tables; writes use owner + revision compare-and-swap. */
export class PrismaAutomationStore {
  mode = "prisma";
  constructor(client) { this.client = client; }
  account(username) { return this.client.automationAccount.findUnique({ where: { username } }); }
  async createAccount(data) {
    try { return await this.client.automationAccount.create({ data }); }
    catch (error) { if (error.code === "P2002") throw new AppError("ACCOUNT_EXISTS", "Choose another username or sign in.", { status: 409 }); throw error; }
  }
  create(ownerId, document) { return this.client.automationWorkspace.create({ data: { ownerId, document } }); }
  get(ownerId, id) { return this.client.automationWorkspace.findFirst({ where: { id, ownerId } }); }
  list(ownerId) { return this.client.automationWorkspace.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" }, take: 30 }); }
  async save(ownerId, id, revision, document) {
    const result = await this.client.automationWorkspace.updateMany({ where: { id, ownerId, revision }, data: { document, revision: { increment: 1 } } });
    if (result.count !== 1) throw conflict();
    // Return the exact written snapshot, even if a subsequent writer updates the row.
    return { id, ownerId, revision: revision + 1, document, updatedAt: new Date().toISOString() };
  }
}
