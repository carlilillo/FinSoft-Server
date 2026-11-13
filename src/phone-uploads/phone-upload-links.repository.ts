import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import type { PhoneUploadLinkState } from './domain/phone-upload-link.js';
import { PhoneUploadLinkEntity } from './entities/phone-upload-link.entity.js';

@Injectable()
export class PhoneUploadLinksRepository {
  constructor(
    @InjectRepository(PhoneUploadLinkEntity)
    private readonly repo: Repository<PhoneUploadLinkEntity>,
  ) {}

  /**
   * Shows the user's open link again or creates one, while holding a per-user lock so two quick clicks
   * can't both create a link. `choose` gets the user's open, unexpired links and returns one of them, or
   * a new link, which is then inserted.
   */
  reuseOrCreate(
    userId: string,
    now: Date,
    choose: (open: PhoneUploadLinkState[]) => PhoneUploadLinkState,
  ): Promise<PhoneUploadLinkState> {
    return this.repo.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`phone-upload-links:${userId}`]);
      const open = await manager.find(PhoneUploadLinkEntity, {
        where: { userId, status: 'open', expiresAt: MoreThan(now) },
      });
      const chosen = choose(open);
      if (!open.some((link) => link.id === chosen.id)) await manager.insert(PhoneUploadLinkEntity, chosen);
      return chosen;
    });
  }

  findOwned(userId: string, id: string): Promise<PhoneUploadLinkEntity | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  findByTokenHash(tokenHash: string): Promise<PhoneUploadLinkEntity | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  /**
   * Runs `use` while holding the link's row lock, then saves the state it returns. Two submissions of
   * the same link are serialized: the second one sees the link the first one disabled. When `use`
   * throws, nothing is saved and the link stays as it was. `use` gets null when no link has this hash.
   */
  useExclusively(
    tokenHash: string,
    use: (link: PhoneUploadLinkEntity | null) => Promise<PhoneUploadLinkState>,
  ): Promise<PhoneUploadLinkState> {
    return this.repo.manager.transaction(async (manager) => {
      const link = await manager.findOne(PhoneUploadLinkEntity, {
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      const next = await use(link);
      await manager.update(PhoneUploadLinkEntity, { id: next.id }, next);
      return next;
    });
  }
}
