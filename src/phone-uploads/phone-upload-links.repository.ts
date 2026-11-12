import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PhoneUploadLinkState } from './domain/phone-upload-link.js';
import { PhoneUploadLinkEntity } from './entities/phone-upload-link.entity.js';

@Injectable()
export class PhoneUploadLinksRepository {
  constructor(
    @InjectRepository(PhoneUploadLinkEntity)
    private readonly repo: Repository<PhoneUploadLinkEntity>,
  ) {}

  async insert(link: PhoneUploadLinkState): Promise<void> {
    await this.repo.insert(link);
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
