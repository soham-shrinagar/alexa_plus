export class AppError extends Error { constructor(code, message, { status = 500, retryable = false } = {}) { super(message); this.code = code; this.status = status; this.retryable = retryable; } }
export const forbidden = (message = "You are not allowed to access this resource.") => new AppError("FORBIDDEN", message, { status: 403 });
export const unavailable = (message = "The requested service is temporarily unavailable.") => new AppError("PROVIDER_UNAVAILABLE", message, { status: 503, retryable: true });
