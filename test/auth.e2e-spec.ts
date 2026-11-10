import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ClerkAuthGuard } from '../src/common/auth/clerk-auth.guard.js';
import type { AuthContext } from '../src/common/auth/auth.types.js';
import { CurrentUser } from '../src/common/auth/current-user.decorator.js';
import { Public } from '../src/common/auth/public.decorator.js';
import { AppConfigService } from '../src/config/app-config.service.js';

const verifyToken = vi.hoisted(() => vi.fn());
vi.mock('@clerk/backend', () => ({ verifyToken }));

@Controller()
class ProbeController {
  @Get('private')
  whoAmI(@CurrentUser() auth: AuthContext) {
    return auth;
  }

  @Public()
  @Get('public')
  open() {
    return { ok: true };
  }
}

describe('ClerkAuthGuard (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: ClerkAuthGuard },
        { provide: AppConfigService, useValue: { get: (key: string) => (key === 'CLERK_AUTHORIZED_PARTIES' ? ['http://localhost:5173'] : 'pem') } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('rejects requests without a bearer token', () => request(app.getHttpServer()).get('/private').expect(401));

  it('rejects invalid tokens', async () => {
    verifyToken.mockRejectedValueOnce(new Error('bad signature'));
    await request(app.getHttpServer()).get('/private').set('Authorization', 'Bearer nope').expect(401);
  });

  it('exposes the Clerk user id of a valid session', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user_2abcdefghijklmnopqrstuvwxyz1' });
    await request(app.getHttpServer())
      .get('/private')
      .set('Authorization', 'Bearer good')
      .expect(200, { userId: 'user_2abcdefghijklmnopqrstuvwxyz1' });
    expect(verifyToken).toHaveBeenLastCalledWith('good', { jwtKey: 'pem', authorizedParties: ['http://localhost:5173'] });
  });

  it('lets public routes through', () => request(app.getHttpServer()).get('/public').expect(200, { ok: true }));
});
