import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { from, type Observable, switchMap } from 'rxjs';
import type { AuthenticatedRequest } from '../common/auth/auth.types.js';
import { UsersService } from './users.service.js';

/** Makes sure every authenticated Clerk user has a `users` row before the handler runs (FK target). */
@Injectable()
export class EnsureUserInterceptor implements NestInterceptor {
  constructor(private readonly usersService: UsersService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>();
    const userId = request.auth?.userId;
    if (!userId) return next.handle();
    return from(this.usersService.ensureUser(userId)).pipe(switchMap(() => next.handle()));
  }
}
