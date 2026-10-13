import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { AppError } from "../errors.js";

const scrypt = promisify(scryptCallback);
const credentials = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,60}$/), password: z.string().min(12).max(128) }).strict();
export class AutomationIdentity {
  constructor({ store, tokenService, registrationEnabled = true }) { this.store = store; this.tokens = tokenService; this.registrationEnabled = registrationEnabled; }
  async session(raw, register = false) {
    const { username, password } = credentials.parse(raw);
    if (register && !this.registrationEnabled) throw new AppError("REGISTRATION_DISABLED", "Registration is disabled on this server.", { status: 403 });
    let account;
    if (register) {
      const salt = randomBytes(16).toString("hex"), passwordHash = (await scrypt(password, salt, 64)).toString("hex");
      account = await this.store.createAccount({ username, salt, passwordHash });
    } else {
      account = await this.store.account(username);
      const value = await scrypt(password, account?.salt ?? "00000000000000000000000000000000", 64);
      if (!account || !timingSafeEqual(value, Buffer.from(account.passwordHash, "hex"))) throw new AppError("INVALID_LOGIN", "Username or password is incorrect.", { status: 401 });
    }
    return { accessToken: this.tokens.issue({ userId: `automation-account:${account.id}`, clientId: "automation-workspace", scopes: ["mcp:tools"], expiresIn: "1h" }), expiresIn: 3600, username: account.username, storage: this.store.mode, endpoint: "/mcp" };
  }
}
