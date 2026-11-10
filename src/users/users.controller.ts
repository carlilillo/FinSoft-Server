import { Controller, Delete, Get, HttpCode, HttpStatus } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { AccountService } from './account.service.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountService: AccountService,
  ) {}

  @Get()
  async me(@CurrentUser() auth: AuthContext) {
    const user = await this.usersService.findByClerkId(auth.userId);
    return { userId: auth.userId, createdAt: user?.createdAt ?? null };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentUser() auth: AuthContext): Promise<void> {
    return this.accountService.deleteAccount(auth.userId);
  }
}
