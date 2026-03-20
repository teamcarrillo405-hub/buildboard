/**
 * Wild Apricot OAuth2 client
 *
 * All communication with Wild Apricot happens server-side because
 * the WA API does not support CORS.  The authorization-code flow is:
 *
 *   1. Redirect user to WA login page (getLoginUrl)
 *   2. WA redirects back with ?code=&state=
 *   3. Server exchanges code for tokens  (exchangeCode)
 *   4. Server fetches user contact info   (getUserInfo)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WATokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  permissions: Array<{ AccountId: number; AvailableScopes: string[] }>;
}

export interface WAUser {
  Id: number;
  FirstName: string;
  LastName: string;
  Email: string;
  MembershipLevel?: { Id: number; Name: string } | null;
  Status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Derive the WA org domain from WA_ACCOUNT_URL (e.g. "https://hcc.wildapricot.org" -> "hcc.wildapricot.org") */
function getAccountDomain(): string {
  const url = requireEnv('WA_ACCOUNT_URL');
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the Wild Apricot OAuth authorization URL.
 *
 * @param state - CSRF token to round-trip through the redirect
 * @param redirectUri - The callback URL registered in WA
 */
export function getLoginUrl(state: string, redirectUri: string): string {
  const clientId = requireEnv('WA_CLIENT_ID');
  const domain = getAccountDomain();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'contacts_me',
    state,
    response_type: 'code',
  });

  return `https://${domain}/sys/login/OAuthLogin?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access / refresh token pair.
 *
 * Uses HTTP Basic auth with client_id:client_secret and
 * application/x-www-form-urlencoded body as required by WA.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<WATokenResponse> {
  const clientId = requireEnv('WA_CLIENT_ID');
  const clientSecret = requireEnv('WA_CLIENT_SECRET');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'contacts_me',
  });

  const res = await fetch('https://oauth.wildapricot.org/auth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WA token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as WATokenResponse;
}

/**
 * Fetch the authenticated user's contact record from the WA API.
 *
 * Uses the /v2/accounts/{accountId}/contacts/me endpoint with a Bearer token.
 */
export async function getUserInfo(
  accessToken: string,
  accountId: number,
): Promise<WAUser> {
  const res = await fetch(
    `https://api.wildapricot.org/v2/accounts/${accountId}/contacts/me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WA user info request failed (${res.status}): ${text}`);
  }

  return (await res.json()) as WAUser;
}
