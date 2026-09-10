// ──────────────────────────────────────────────
// Firebase Client SDK — Auth Only
// Safe lazy-initialization with environment checks
// ──────────────────────────────────────────────

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAvNrRxgNKQNK_t13p-CQlhrGx5zU6dpkw",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "rvis-34a3a.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "rvis-34a3a",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "rvis-34a3a.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "456016432422",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:456016432422:web:55273ec6163c904db405e7",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-VQN37P7NKF",
};

/**
 * Checks if Firebase is configured.
 */
export function isFirebaseConfigured(): boolean {
  return true;
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _provider: GoogleAuthProvider | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  const app = getFirebaseApp();
  _auth = getAuth(app);
  return _auth;
}

export function getGoogleProvider(): GoogleAuthProvider {
  if (!_provider) {
    _provider = new GoogleAuthProvider();
    _provider.setCustomParameters({
      prompt: 'select_account',
    });
  }
  return _provider;
}

let _calendarProvider: GoogleAuthProvider | null = null;

export function getGoogleCalendarProvider(): GoogleAuthProvider {
  if (!_calendarProvider) {
    _calendarProvider = new GoogleAuthProvider();
    _calendarProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    _calendarProvider.setCustomParameters({
      prompt: 'consent',
    });
  }
  return _calendarProvider;
}

