export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", message);
  }
}
export class PlanLimitError extends AppError {
  constructor(message = "Plan limit reached") {
    super("PLAN_LIMIT", message);
  }
}
export class ValidationError extends AppError {
  constructor(message = "Invalid input") {
    super("VALIDATION", message);
  }
}
