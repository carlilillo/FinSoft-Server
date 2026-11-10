import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Verifies the Clerk session JWT sent as `Authorization: Bearer <token>`.
 * Verification is networkless: it uses the PEM public key (CLERK_JWT_KEY).
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing session token');

    try {
      const payload = await verifyToken(token, {
        jwtKey: this.config.get('CLERK_JWT_KEY'),
        authorizedParties: this.config.get('CLERK_AUTHORIZED_PARTIES'),
      });
      request.auth = { userId: payload.sub };
      return true;
    } catch (error) {
      this.logger.debug(`Rejected session token: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired session token');
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}
