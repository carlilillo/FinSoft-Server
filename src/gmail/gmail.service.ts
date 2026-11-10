import { Injectable, Logger } from '@nestjs/common';
import { google, type gmail_v1 } from 'googleapis';
import { TokenCipherService } from '../common/crypto/token-cipher.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { newId } from '../database/ids.js';
import { GmailNotConnectedError, signOAuthState, verifyOAuthState } from './domain/oauth-state.js';
import { GmailConnectionsRepository } from './gmail-connections.repository.js';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'];
const FETCH_CONCURRENCY = 5;
const MAX_RETRIES = 5;

export interface RawGmailMessage {
  gmailMessageId: string;
  raw: Buffer;
}

export interface GmailConnectionStatus {
  connected: boolean;
  googleEmail: string | null;
  connectedAt: Date | null;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly connections: GmailConnectionsRepository,
    private readonly cipher: TokenCipherService,
  ) {}

  buildConsentUrl(userId: string): string {
    return this.createClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GMAIL_SCOPES,
      state: signOAuthState(userId, this.config.get('OAUTH_STATE_SECRET'), new Date()),
    });
  }

  /** Validates the callback state, exchanges the code and stores the refresh token encrypted. Returns the Clerk user id. */
  async completeConsent(code: string, state: string): Promise<string> {
    const { userId } = verifyOAuthState(state, this.config.get('OAUTH_STATE_SECRET'), new Date());
    const client = this.createClient();
    const { tokens } = await client.getToken(code);
    const existing = await this.connections.findByUser(userId);
    const refreshToken = tokens.refresh_token ?? (existing ? this.cipher.decrypt(existing.refreshTokenEnc) : null);
    if (!refreshToken) throw new GmailNotConnectedError();

    await this.connections.upsert({
      id: existing?.id ?? newId(),
      userId,
      googleEmail: await this.resolveEmail(client, tokens.id_token ?? null),
      refreshTokenEnc: this.cipher.encrypt(refreshToken),
      scopes: tokens.scope ?? GMAIL_SCOPES.join(' '),
      connectedAt: new Date(),
    });
    this.logger.log({ userId }, 'Gmail connected');
    return userId;
  }

  async getStatus(userId: string): Promise<GmailConnectionStatus> {
    const connection = await this.connections.findByUser(userId);
    return {
      connected: connection !== null,
      googleEmail: connection?.googleEmail ?? null,
      connectedAt: connection?.connectedAt ?? null,
    };
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await this.connections.findByUser(userId)) !== null;
  }

  async disconnect(userId: string): Promise<void> {
    const connection = await this.connections.findByUser(userId);
    if (!connection) return;
    try {
      await this.createClient().revokeToken(this.cipher.decrypt(connection.refreshTokenEnc));
    } catch (error) {
      this.logger.warn({ userId, error: (error as Error).message }, 'Google token revocation failed; removing locally');
    }
    await this.connections.deleteByUser(userId);
  }

  /** Raw RFC 822 messages from the inbox received in the last 7 days, newest first. */
  async fetchLastWeek(userId: string): Promise<RawGmailMessage[]> {
    const gmail = await this.gmailFor(userId);
    const ids = await this.listRecentInboxIds(gmail, this.config.get('GMAIL_MAX_MESSAGES'));
    const messages: RawGmailMessage[] = [];

    for (let index = 0; index < ids.length; index += FETCH_CONCURRENCY) {
      const batch = ids.slice(index, index + FETCH_CONCURRENCY);
      messages.push(...(await Promise.all(batch.map((id) => this.fetchRaw(gmail, id)))));
    }
    this.logger.log({ userId, count: messages.length }, 'Fetched raw Gmail messages');
    return messages;
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

  private async fetchRaw(gmail: gmail_v1.Gmail, id: string): Promise<RawGmailMessage> {
    const response = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id, format: 'raw' }));
    return { gmailMessageId: id, raw: Buffer.from(response.data.raw ?? '', 'base64url') };
  }

  private async gmailFor(userId: string): Promise<gmail_v1.Gmail> {
    const connection = await this.connections.findByUser(userId);
    if (!connection) throw new GmailNotConnectedError();
    const client = this.createClient();
    client.setCredentials({ refresh_token: this.cipher.decrypt(connection.refreshTokenEnc) });
    return google.gmail({ version: 'v1', auth: client });
  }

  private async resolveEmail(client: OAuth2Client, idToken: string | null): Promise<string | null> {
    if (!idToken) return null;
    const ticket = await client.verifyIdToken({ idToken, audience: this.config.get('GOOGLE_CLIENT_ID') });
    return ticket.getPayload()?.email ?? null;
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
