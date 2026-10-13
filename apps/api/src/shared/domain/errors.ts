export interface FieldError {
  path: string;
  message: string;
}

export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly httpStatus = 400;
  constructor(message = 'Dados inválidos', details?: FieldError[], code = 'VALIDATION_ERROR') {
    super(code, message, details);
  }
}
export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;
  constructor(message = 'Não autenticado', code = 'UNAUTHORIZED') {
    super(code, message);
  }
}
export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
  constructor(message = 'Sem permissão', code = 'FORBIDDEN') {
    super(code, message);
  }
}
export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
  constructor(message = 'Recurso não encontrado', code = 'NOT_FOUND') {
    super(code, message);
  }
}
export class ConflictError extends DomainError {
  readonly httpStatus = 409;
  constructor(message = 'Conflito', code = 'CONFLICT') {
    super(code, message);
  }
}
/** Regra de negócio violada (entidade válida, operação não permitida no estado atual). */
export class BusinessRuleError extends DomainError {
  readonly httpStatus = 422;
  constructor(message: string, code = 'BUSINESS_RULE_VIOLATION') {
    super(code, message);
  }
}
export class RateLimitedError extends DomainError {
  readonly httpStatus = 429;
  constructor(message = 'Muitas tentativas. Tente novamente mais tarde.', code = 'RATE_LIMITED') {
    super(code, message);
  }
}
export class ExternalServiceError extends DomainError {
  readonly httpStatus = 502;
  constructor(message: string, code = 'EXTERNAL_SERVICE_ERROR') {
    super(code, message);
  }
}
