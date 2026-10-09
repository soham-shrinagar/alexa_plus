import crypto from "node:crypto";
import { AppError, forbidden } from "../errors.js";

export class ApprovalService {
  constructor(repository, now = () => Date.now()) { this.repository = repository; this.now = now; }
  async request(userId, actionType, payload, ttlMs = 300_000) { return this.repository.createApproval(userId, { actionType, payloadHash: hash(payload), expiresAt: new Date(this.now() + ttlMs).toISOString(), status: "PENDING" }); }
  async approve(userId, approvalId) { const approval = await this.repository.getApproval(userId, approvalId); if (approval.status !== "PENDING" || new Date(approval.expiresAt).getTime() <= this.now()) throw new AppError("APPROVAL_EXPIRED", "This approval has expired or is no longer pending.", { status: 409 }); return this.repository.updateApproval(userId, approvalId, { status: "APPROVED" }); }
  async consume(userId, approvalId, actionType, payload) { const approval = await this.repository.getApproval(userId, approvalId); if (approval.actionType !== actionType || approval.payloadHash !== hash(payload)) throw forbidden("The approval does not match this action."); if (approval.status !== "APPROVED" || approval.consumedAt || new Date(approval.expiresAt).getTime() <= this.now()) throw new AppError("INVALID_APPROVAL", "The approval is expired, consumed, or not approved.", { status: 409 }); return this.repository.updateApproval(userId, approvalId, { status: "CONSUMED", consumedAt: new Date(this.now()).toISOString() }); }
}
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(sort(value))).digest("hex"); }
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])])); return value; }
