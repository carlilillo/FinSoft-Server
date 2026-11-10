import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { EmailsModule } from '../emails/emails.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { AgentPersistenceService } from './agent-persistence.service.js';
import { AgentRunnerService } from './agent-runner.service.js';
import { InboxWorkspaceService } from './files/inbox-workspace.service.js';
import { InvoiceAgentFactory } from './invoice-agent.factory.js';
import { AgentToolsFactory } from './tools/agent-tools.factory.js';

@Module({
  imports: [EmailsModule, InvoicesModule, DocumentsModule],
  providers: [AgentPersistenceService, InboxWorkspaceService, AgentToolsFactory, InvoiceAgentFactory, AgentRunnerService],
  exports: [AgentPersistenceService, InboxWorkspaceService, AgentRunnerService],
})
export class AgentModule {}
