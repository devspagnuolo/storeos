import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_PREFIX = /^\/?api\/v1\//;

type Req = { method: string; route?: { path?: string }; params?: Record<string, string>; body?: unknown; ip?: string; headers: Record<string, string | undefined>; user?: { sub?: string; storeId?: string } };

/**
 * Trilha de auditoria transversal: toda alteração (POST, PUT, PATCH, DELETE) feita por um usuário autenticado
 * do painel vira um registro, com autor, rota, alvo, resultado, IP e corpo sem segredos.
 * Rotas públicas (vitrine, checkout, webhooks) não passam por aqui: o histórico delas está no pedido e no pagamento.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Req>();
    if (!MUTATING.has(request.method) || !request.user?.sub) return next.handle();

    const path = (request.route?.path ?? '').replace(API_PREFIX, '');
    const [entity] = path.split('/');
    const entityId = request.params?.id ?? request.params?.number;
    const base = {
      storeId: request.user.storeId,
      actorId: request.user.sub,
      action: `${request.method} /${path}`,
      entity: entity || null,
      entityId: entityId ?? null,
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 300),
      requestId: request.headers['x-request-id'] ?? randomUUID(),
      metadata: { body: request.body },
    };
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    return next.handle().pipe(
      mergeMap(value => from(this.audit.record({ ...base, outcome: 'SUCCESS', statusCode: response.statusCode })).pipe(mergeMap(() => [value]))),
      catchError(error => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        return from(this.audit.record({ ...base, outcome: status === 401 || status === 403 ? 'DENIED' : 'FAILURE', statusCode: status })).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }
}
