import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { RequestContext } from '../../infrastructure/request-context';
import type { AppRequest } from '../request.types';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: AppRequest, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    RequestContext.run({ requestId, ip: req.ip, userAgent: req.headers['user-agent'] }, () => next());
  }
}
