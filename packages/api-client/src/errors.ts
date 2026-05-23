export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class ModuleDisabledError extends ForbiddenError {
  constructor(message = "Module disabled") {
    super(message)
    this.name = "ModuleDisabledError"
  }
}

export class EntitlementRequiredError extends ForbiddenError {
  constructor(message = "Entitlement required") {
    super(message)
    this.name = "EntitlementRequiredError"
  }
}

export class ValidationError extends Error {
  constructor(message = "Validation failed") {
    super(message)
    this.name = "ValidationError"
  }
}

export class RateLimitedError extends Error {
  constructor(message = "Rate limited") {
    super(message)
    this.name = "RateLimitedError"
  }
}
