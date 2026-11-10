import type { Request } from 'express';

export interface AuthContext {
  /** Clerk user id (`user_…`, 32 characters). */
  userId: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}
