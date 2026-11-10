import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { newId } from '../database/ids.js';
import { UserEntity } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  /** Clerk ids already known to exist in this process; avoids an upsert per request. */
  private readonly knownUsers = new Set<string>();

  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  async ensureUser(clerkUserId: string): Promise<void> {
    if (this.knownUsers.has(clerkUserId)) return;
    await this.users
      .createQueryBuilder()
      .insert()
      .values({ id: newId(), clerkUserId })
      .orIgnore()
      .execute();
    this.knownUsers.add(clerkUserId);
  }

  async findByClerkId(clerkUserId: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { clerkUserId } });
  }

  async deleteByClerkId(clerkUserId: string): Promise<void> {
    await this.users.delete({ clerkUserId });
    this.knownUsers.delete(clerkUserId);
  }
}
