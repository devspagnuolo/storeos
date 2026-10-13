import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProblemDetails } from '@storeos/contracts';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../../domain/errors';
import { RequestContext } from '../../infrastructure/request-context';
import { zodIssuesToFieldErrors } from '../pipes/zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = RequestContext.get()?.requestId;
    const problem = this.toProblem(exception, requestId);

    if (problem.status >= 500) {
      const err = exception as Error;
      this.logger.error(`[${requestId}] ${err?.message ?? 'erro desconhecido'}`, err?.stack);
    }
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, requestId?: string): ProblemDetails {
    if (exception instanceof DomainError) {
      return {
        type: `https://storeos.dev/problems/${exception.code.toLowerCase().replace(/_/g, '-')}`,
        title: exception.message,
        status: exception.httpStatus,
        code: exception.code,
        requestId,
        errors: exception.details,
      };
    }
    if (exception instanceof ZodError) {
      return {
        type: 'https://storeos.dev/problems/validation-error',
        title: 'Dados inválidos',
        status: 400,
        code: 'VALIDATION_ERROR',
        requestId,
        errors: zodIssuesToFieldErrors(exception),
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | string | undefined) ?? [];
        return {
          type: 'https://storeos.dev/problems/conflict',
          title: 'Registro duplicado',
          detail: Array.isArray(target) ? `Campos em conflito: ${target.join(', ')}` : String(target),
          status: 409,
          code: 'CONFLICT',
          requestId,
        };
      }
      if (exception.code === 'P2025') {
        return { type: 'https://storeos.dev/problems/not-found', title: 'Recurso não encontrado', status: 404, code: 'NOT_FOUND', requestId };
      }
      if (exception.code === 'P2003') {
        return { type: 'https://storeos.dev/problems/conflict', title: 'Violação de integridade referencial', status: 409, code: 'CONFLICT', requestId };
      }
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? ((body as { message: string[] }).message).join('; ')
            : ((body as { message?: string }).message ?? exception.message);
      return {
        type: 'about:blank',
        title: message,
        status,
        code: status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : `HTTP_${status}`,
        requestId,
      };
    }
    return {
      type: 'https://storeos.dev/problems/internal-error',
      title: 'Erro interno. Informe o requestId ao suporte.',
      status: 500,
      code: 'INTERNAL_ERROR',
      requestId,
    };
  }
}
