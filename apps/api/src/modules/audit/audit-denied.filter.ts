import { ArgumentsHost, Catch, ExceptionFilter, ForbiddenException } from '@nestjs/common';
import { redact } from './audit.service';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Req = { method: string; route?: { path?: string }; params?: Record<string, string>; body?: unknown; ip?: string; headers: Record<string, string | undefined>; user?: { sub?: string; storeId?: string } };

/**
 * Os guards rodam antes do interceptor de auditoria, então uma negada por falta de permissão não passaria por ele.
 * Este filtro registra a tentativa (DENIED) de quem tem sessão válida e devolve a mesma resposta 403 de sempre.
 */
@Catch(ForbiddenException)
export class AuditDeniedFilter implements ExceptionFilter {
  constructor(private readonly audit: AuditService) {}

  async catch(exception: ForbiddenException, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Req>();
    const response = http.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    if (MUTATING.has(request.method) && request.user?.sub) {
      const path = (request.route?.path ?? '').replace(/^\/?api\/v1\//, '');
      await this.audit.record({
        storeId: request.user.storeId, actorId: request.user.sub, action: `${request.method} /${path}`, entity: path.split('/')[0] || null,
        entityId: request.params?.id ?? request.params?.number ?? null, outcome: 'DENIED', statusCode: 403, ip: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 300), requestId: request.headers['x-request-id'], metadata: { body: redact(request.body) },
      });
    }
    response.status(403).json(exception.getResponse());
  }
}
