import { IsIn } from 'class-validator';
import { OAUTH_INTENTS, type OAuthIntent } from '../domain/oauth-state.js';

export class CreateConsentUrlDto {
  /** `analyze`: come back with an analysis started. `connect`: only link the account (Settings). */
  @IsIn(OAUTH_INTENTS)
  intent: OAuthIntent;
}
