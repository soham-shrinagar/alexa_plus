import crypto from "node:crypto";
import { forbidden } from "../errors.js";

export class MemoryRepository {
  constructor() {
    this.proposals = [];
    this.simulations = [];
    this.activations = [];
    this.approvals = [];
    this.auditEvents = [];
  }

  async createProposal(userId, input) {
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), userId, status: "DRAFT", version: 1, ...structuredClone(input), createdAt: now, updatedAt: now };
    this.proposals.push(record);
    return structuredClone(record);
  }

  async getProposal(userId, id) { return structuredClone(owned(this.proposals, userId, id)); }

  async updateProposal(userId, id, patch) {
    const record = owned(this.proposals, userId, id);
    Object.assign(record, structuredClone(patch), { updatedAt: new Date().toISOString() });
    return structuredClone(record);
  }

  async createSimulation(userId, input) {
    owned(this.proposals, userId, input.proposalId);
    const record = { id: crypto.randomUUID(), userId, ...structuredClone(input), createdAt: new Date().toISOString() };
    this.simulations.push(record);
    return structuredClone(record);
  }

  async createApproval(userId, input) {
    const record = { id: crypto.randomUUID(), userId, ...structuredClone(input), createdAt: new Date().toISOString() };
    this.approvals.push(record);
    return structuredClone(record);
  }

  async getApproval(userId, id) { return structuredClone(owned(this.approvals, userId, id)); }

  async updateApproval(userId, id, patch) {
    const record = owned(this.approvals, userId, id);
    Object.assign(record, structuredClone(patch));
    return structuredClone(record);
  }

  async createActivation(userId, input) {
    if (input.idempotencyKey) {
      const existing = this.activations.find((item) => item.userId === userId && item.idempotencyKey === input.idempotencyKey);
      if (existing) return structuredClone(existing);
    }
    owned(this.proposals, userId, input.proposalId);
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), userId, status: "ACTIVE", ...structuredClone(input), activatedAt: now, createdAt: now, updatedAt: now };
    this.activations.push(record);
    return structuredClone(record);
  }

  async getActivation(userId, id) { return structuredClone(owned(this.activations, userId, id)); }

  async getActivationByIdempotencyKey(userId, idempotencyKey) {
    const record = this.activations.find((item) => item.userId === userId && item.idempotencyKey === idempotencyKey);
    return record ? structuredClone(record) : null;
  }

  async getActiveActivationForProposal(userId, proposalId) {
    const record = this.activations.find((item) => item.userId === userId && item.proposalId === proposalId && item.status === "ACTIVE");
    if (!record) throw forbidden();
    return structuredClone(record);
  }

  async updateActivation(userId, id, patch) {
    const record = owned(this.activations, userId, id);
    Object.assign(record, structuredClone(patch), { updatedAt: new Date().toISOString() });
    return structuredClone(record);
  }

  async addAuditEvent(userId, input) {
    const record = { id: crypto.randomUUID(), userId, ...structuredClone(input), createdAt: new Date().toISOString() };
    this.auditEvents.push(record);
    return structuredClone(record);
  }

  async listAuditEvents(userId, proposalId) {
    return this.auditEvents.filter((item) => item.userId === userId && (!proposalId || item.proposalId === proposalId)).map((item) => structuredClone(item));
  }
}

function owned(collection, userId, id) {
  const record = collection.find((item) => item.id === id && item.userId === userId);
  if (!record) throw forbidden();
  return record;
}
