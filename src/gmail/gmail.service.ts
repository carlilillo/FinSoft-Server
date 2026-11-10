import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { google, type gmail_v1 } from 'googleapis';
import { TokenCipherService } from '../common/crypto/token-cipher.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { newId } from '../database/ids.js';
import {
  GmailAccessRevokedError,
  GmailAccountUnknownError,
  GmailNotConnectedError,
  type OAuthIntent,
  signOAuthState,
  verifyOAuthState,
} from './domain/oauth-state.js';
import type { GmailConnectionEntity } from './entities/gmail-connection.entity.js';
import { GmailConnectionsRepository } from './gmail-connections.repository.js';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'];
const FETCH_CONCURRENCY = 5;
const MAX_RETRIES = 5;

export interface RawGmailMessage {
  /** The linked account whose inbox the message was read from; null for fixtures. */
  gmailConnectionId: string | null;
  gmailMessageId: string;
  raw: Buffer;
}

export interface GmailConnectionView {
  id: string;
  googleEmail: string;
  connectedAt: Date;
}

export interface CompletedConsent {
  userId: string;
  intent: OAuthIntent;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly connections: GmailConnectionsRepository,
    private readonly cipher: TokenCipherService,
  ) {}

  /** `select_account` lets the person pick a different Google account than the one already linked. */
  buildConsentUrl(userId: string, intent: OAuthIntent): string {
    return this.createClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: true,
      scope: GMAIL_SCOPES,
      state: signOAuthState(userId, intent, this.config.get('OAUTH_STATE_SECRET'), new Date()),
    });
  }

  /**
   * Validates the callback state, exchanges the code and stores the account's refresh token encrypted.
   * Linking an address the user already has refreshes that connection instead of adding a second one.
   */
  async completeConsent(code: string, state: string): Promise<CompletedConsent> {
    const { userId, intent } = verifyOAuthState(state, this.config.get('OAUTH_STATE_SECRET'), new Date());
    const client = this.createClient();
    const { tokens } = await client.getToken(code);
    const googleEmail = await this.resolveEmail(client, tokens.id_token ?? null);
    if (!googleEmail) throw new GmailAccountUnknownError();

    const existing = await this.connections.findByEmail(userId, googleEmail);
    const refreshToken =
      tokens.refresh_token ?? (existing?.refreshTokenEnc ? this.cipher.decrypt(existing.refreshTokenEnc) : null);
    if (!refreshToken) throw new GmailNotConnectedError();

    await this.connections.save({
      id: existing?.id ?? newId(),
      userId,
      googleEmail,
      refreshTokenEnc: this.cipher.encrypt(refreshToken),
      scopes: tokens.scope ?? GMAIL_SCOPES.join(' '),
      connectedAt: existing?.refreshTokenEnc ? existing.connectedAt : new Date(),
    });
    this.logger.log({ userId, intent }, 'Gmail account connected');
    return { userId, intent };
  }

  /** Why the user went to Google, read from the callback state; `analyze` when the state cannot be trusted. */
  consentIntent(state: string | undefined): OAuthIntent {
    if (!state) return 'analyze';
    try {
      return verifyOAuthState(state, this.config.get('OAUTH_STATE_SECRET'), new Date()).intent;
    } catch {
      return 'analyze';
    }
  }

  async listConnections(userId: string): Promise<GmailConnectionView[]> {
    const connections = await this.connections.findConnected(userId);
    return connections.map(({ id, googleEmail, connectedAt }) => ({ id, googleEmail, connectedAt }));
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await this.connections.countConnected(userId)) > 0;
  }

  /** Address of every account the user ever linked, by connection id: the origin shown on emails and invoices. */
  accountAddresses(userId: string): Promise<Map<string, string>> {
    return this.connections.findAddresses(userId);
  }

  /** Revokes the account's grant at Google and forgets its token; emails and invoices keep their origin. */
  async disconnect(userId: string, connectionId: string): Promise<void> {
    const connection = await this.connections.findOwned(userId, connectionId);
    if (!connection) throw new NotFoundException(`Gmail account ${connectionId} not found`);
    if (!connection.refreshTokenEnc) return;
    try {
      await this.createClient().revokeToken(this.cipher.decrypt(connection.refreshTokenEnc));
    } catch (error) {
      this.logger.warn({ userId, connectionId, error: (error as Error).message }, 'Google token revocation failed; removing locally');
    }
    await this.connections.clearToken(connection.id);
  }

  /**
   * Raw RFC 822 messages received in the last 7 days in the inbox of every connected account, each
   * tagged with its account. One account that can no longer be read fails the whole fetch, so an
   * analysis never looks complete while an inbox was silently skipped.
   */
  async fetchLastWeek(userId: string): Promise<RawGmailMessage[]> {
    const connections = await this.connections.findConnected(userId);
    if (connections.length === 0) throw new GmailNotConnectedError();

    const perAccount = await Promise.all(connections.map((connection) => this.fetchAccountLastWeek(connection)));
    const messages = perAccount.flat();
    this.logger.log({ userId, accounts: connections.length, count: messages.length }, 'Fetched raw Gmail messages');
    return messages;
  }

  private async fetchAccountLastWeek(connection: GmailConnectionEntity): Promise<RawGmailMessage[]> {
    const gmail = this.gmailFor(connection);
    try {
      const ids = await this.listRecentInboxIds(gmail, this.config.get('GMAIL_MAX_MESSAGES'));
      const messages: RawGmailMessage[] = [];
      for (let index = 0; index < ids.length; index += FETCH_CONCURRENCY) {
        const batch = ids.slice(index, index + FETCH_CONCURRENCY);
        messages.push(...(await Promise.all(batch.map((id) => this.fetchRaw(gmail, connection.id, id)))));
      }
      return messages;
    } catch (error) {
      if (/invalid_grant/i.test((error as Error).message)) throw new GmailAccessRevokedError(connection.googleEmail);
      throw error;
    }
  }

  private async listRecentInboxIds(gmail: gmail_v1.Gmail, limit: number): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const response = await withBackoff(() =>
        gmail.users.messages.list({
          userId: 'me',
          q: 'in:inbox newer_than:7d',
          maxResults: Math.min(500, limit - ids.length),
          pageToken,
        }),
      );
      ids.push(...(response.data.messages ?? []).flatMap((message) => (message.id ? [message.id] : [])));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken && ids.length < limit);
    return ids.slice(0, limit);
  }

  private async fetchRaw(gmail: gmail_v1.Gmail, gmailConnectionId: string, id: string): Promise<RawGmailMessage> {
    const response = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id, format: 'raw' }));
    return { gmailConnectionId, gmailMessageId: id, raw: Buffer.from(response.data.raw ?? '', 'base64url') };
  }

  private gmailFor(connection: GmailConnectionEntity): gmail_v1.Gmail {
    if (!connection.refreshTokenEnc) throw new GmailNotConnectedError();
    const client = this.createClient();
    client.setCredentials({ refresh_token: this.cipher.decrypt(connection.refreshTokenEnc) });
    return google.gmail({ version: 'v1', auth: client });
  }

  private async resolveEmail(client: OAuth2Client, idToken: string | null): Promise<string | null> {
    if (!idToken) return null;
    const ticket = await client.verifyIdToken({ idToken, audience: this.config.get('GOOGLE_CLIENT_ID') });
    return ticket.getPayload()?.email?.toLowerCase() ?? null;
  }

  private createClient(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get('GOOGLE_CLIENT_ID'),
      this.config.get('GOOGLE_CLIENT_SECRET'),
      this.config.get('GOOGLE_REDIRECT_URI'),
    );
  }
}

/** Exponential backoff with jitter for Gmail 429/5xx responses. */
async function withBackoff<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const status = (error as { code?: number; status?: number }).code ?? (error as { status?: number }).status;
      const retryable = status === 429 || (typeof status === 'number' && status >= 500);
      if (!retryable || attempt >= MAX_RETRIES) throw error;
      const delay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, 32_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
