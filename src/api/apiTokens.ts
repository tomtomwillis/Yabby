/**
 * Read-only API tokens for apps that cannot sign in to Firebase (Yeishin).
 * Routes: backend_server/routes/apiTokens.js. Minting is admin only for now.
 */

import { apiRequest } from './http';

export interface ApiToken {
  id: string;
  label: string;
  scopes: string[];
  created: number;
  lastUsed: number | null;
}

export interface MintedApiToken extends ApiToken {
  /** Shown once; the server keeps only its hash. */
  token: string;
}

export async function listApiTokens(): Promise<ApiToken[]> {
  const answer = await apiRequest<{ tokens: ApiToken[] }>('GET', '/tokens');
  return answer.tokens;
}

export function mintApiToken(label: string): Promise<MintedApiToken> {
  return apiRequest<MintedApiToken>('POST', '/tokens', { body: { label } });
}

export async function revokeApiToken(id: string): Promise<void> {
  await apiRequest('DELETE', `/tokens/${encodeURIComponent(id)}`);
}
