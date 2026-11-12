import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { PhoneUploadsService } from './phone-uploads.service.js';

/** Signed-in side: the computer creates the QR code's link and waits for the phone to use it. */
@Controller('phone-uploads')
export class PhoneUploadsController {
  constructor(private readonly phoneUploads: PhoneUploadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() auth: AuthContext) {
    return this.phoneUploads.create(auth.userId);
  }

  @Get(':id')
  status(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.phoneUploads.status(auth.userId, id);
  }
}
