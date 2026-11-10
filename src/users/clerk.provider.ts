import { createClerkClient, type ClerkClient } from '@clerk/backend';
import type { Provider } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';

export const CLERK_CLIENT = Symbol('CLERK_CLIENT');

export const clerkClientProvider: Provider<ClerkClient> = {
  provide: CLERK_CLIENT,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) => createClerkClient({ secretKey: config.get('CLERK_SECRET_KEY') }),
};
