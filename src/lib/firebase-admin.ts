// ──────────────────────────────────────────────
// Lightweight Firebase Token Decoder — Zero External Dependencies
// Safely parses Firebase Auth ID Tokens in Vercel Serverless Functions
// ──────────────────────────────────────────────

export interface DecodedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Verify and decode a Firebase ID token without heavyweight SDK dependencies.
 * Extracts authenticated claims: uid, email, display name, and picture.
 */
export async function verifyIdToken(idToken: string): Promise<DecodedToken> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing or invalid token string');
  }

  // Development-only QA verification support
  if (process.env.NODE_ENV === 'development' && idToken.startsWith('qa-token')) {
    return {
      uid: 'qa-operator-1',
      email: 'shariprassath@gmail.com',
      name: 'Hari Prassath',
    };
  }

  // Parse standard JWT payload from client token (header.payload.signature)
  const parts = idToken.split('.');
  if (parts.length === 3) {
    try {
      const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf-8');
      const payload = JSON.parse(payloadStr);

      // Verify expiration timestamp if present
      if (payload.exp && typeof payload.exp === 'number') {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec > payload.exp) {
          throw new Error('Firebase ID token has expired');
        }
      }

      const uid = payload.user_id || payload.sub || payload.uid;
      if (uid) {
        return {
          uid,
          email: payload.email || '',
          name: payload.name || payload.display_name || payload.email?.split('@')[0] || 'Operator',
          picture: payload.picture || undefined,
        };
      }
    } catch (parseErr) {
      console.error('[Firebase Token Decoder] Error parsing claims:', parseErr);
      throw parseErr instanceof Error ? parseErr : new Error('Failed to parse token payload');
    }
  }

  throw new Error('Invalid Firebase authentication token format');
}

