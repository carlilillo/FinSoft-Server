import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { ImportDirectionDto } from '../invoices/dto/import-direction.dto.js';
import { PhoneUploadsService } from './phone-uploads.service.js';

/** Signed-in side: the computer gets the QR code's link and waits for the phone to use it. */
@Controller('phone-uploads')
export class PhoneUploadsController {
  constructor(private readonly phoneUploads: PhoneUploadsService) {}

  /**
   * The user's open link for this kind of invoices (`direction`: `issued` or `received`, the default) when one has
   * enough time left, else a new one: always 200 with the link.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createOrReuse(@CurrentUser() auth: AuthContext, @Body() dto: ImportDirectionDto) {
    return this.phoneUploads.createOrReuse(auth.userId, dto.direction);
  }

  @Get(':id')
  status(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.phoneUploads.status(auth.userId, id);
  }
}
