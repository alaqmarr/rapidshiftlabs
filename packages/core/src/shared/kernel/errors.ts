/**
 * Application/domain error hierarchy.
 *
 * Every error carries a stable machine-readable `code` (documented in the public
 * API reference) and an HTTP status hint used by the presentation layer.
 * Domain code throws these; HTTP adapters translate them into the error envelope:
 *   { error: { code, message, details, requestId } }
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super("bad_request", message, 400, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super("validation_error", message, 422, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super("not_found", id ? `${entity} '${id}' was not found` : `${entity} was not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("conflict", message, 409, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("unauthorized", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("forbidden", message, 403);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = "Too many requests") {
    super("rate_limited", message, 429, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Raised when an aggregate invariant / business rule is violated. */
export class DomainRuleError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 422, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    super("external_service_error", `${service}: ${message}`, 502, details);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Narrow helper for invariant checks inside aggregates. */
export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DomainRuleError(code, message);
}
