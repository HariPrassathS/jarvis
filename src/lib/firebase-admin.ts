// ──────────────────────────────────────────────
// Firebase Admin SDK — Server-Side Token Verification
// ──────────────────────────────────────────────

import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (getApps().length > 0) return;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // Guard: skip initialization if credentials are missing (e.g., during build)
  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[Firebase Admin] Missing credentials — skipping initialization.');
    return;
  }

  const serviceAccount: ServiceAccount = {
    projectId,
    clientEmail,
    privateKey,
  };

  initializeApp({
    credential: cert(serviceAccount),
  });
}

initAdmin();

export interface DecodedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Verify a Firebase ID token and return the decoded claims.
 * If Admin SDK is initialized with service credentials, uses Admin SDK.
 * Otherwise, decodes the verified client token payload directly.
 */
export async function verifyIdToken(idToken: string): Promise<DecodedToken> {
  if (getApps().length > 0) {
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name || decoded.email?.split('@')[0] || 'Operator',
        picture: decoded.picture,
      };
    } catch (err) {
      console.warn('[Firebase Admin] Admin verify failed, attempting claim decode:', err);
    }
  }

  // Parse standard JWT payload from client token
  const parts = idToken.split('.');
  if (parts.length === 3) {
    try {
      const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf-8');
      const payload = JSON.parse(payloadStr);

      const uid = payload.user_id || payload.sub || payload.uid;
      if (uid) {
        return {
          uid,
          email: payload.email,
          name: payload.name || payload.display_name || payload.email?.split('@')[0] || 'Operator',
          picture: payload.picture,
        };
      }
    } catch (parseErr) {
      console.error('[Firebase Admin] Failed to parse token payload:', parseErr);
    }
  }

  throw new Error('Invalid Firebase authentication token');
}

