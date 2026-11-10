import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClerkClient } from '@clerk/backend';
import { AgentPersistenceService } from '../agent/agent-persistence.service.js';
import { AnalysisRunsRepository } from '../analysis/analysis-runs.repository.js';
import { RunStillActiveError } from '../analysis/domain/analysis-run.errors.js';
import { isRunActive } from '../analysis/domain/analysis-run.js';
import { StorageService } from '../storage/storage.service.js';
import { CLERK_CLIENT } from './clerk.provider.js';
import { UsersService } from './users.service.js';

/** Removes every trace of a user: DB rows, agent threads, S3 objects and the Clerk account. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly runs: AnalysisRunsRepository,
    private readonly agentPersistence: AgentPersistenceService,
    private readonly storage: StorageService,
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkClient,
  ) {}

  async deleteAccount(userId: string): Promise<void> {
    const userRuns = await this.runs.findAllForUser(userId);
    if (userRuns.some((run) => isRunActive(run.status))) throw new RunStillActiveError();

    await this.agentPersistence.purgeThreads(
      userId,
      userRuns.map((run) => run.id),
    );
    await this.usersService.deleteByClerkId(userId);
    await this.storage.deletePrefix(`users/${userId}/`);
    await this.clerk.users.deleteUser(userId);
    this.logger.log({ userId, runs: userRuns.length }, 'Account deleted');
  }
}
