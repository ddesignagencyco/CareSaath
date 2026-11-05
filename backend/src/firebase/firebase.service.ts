import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import type { Messaging } from 'firebase-admin/messaging';

/**
 * Wraps Firebase Admin SDK auth access. Note: firebase-admin v14 uses the
 * *modular* API (`initializeApp`/`cert` from 'firebase-admin/app', `getAuth`
 * from 'firebase-admin/auth') — the old namespaced `admin.auth()` call does
 * not exist on this version and throws "admin.auth is not a function".
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: App;
  private authInstance?: Auth;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const keyJson = this.configService.get<string>('FIREBASE_ADMIN_SDK_KEY');
    if (!keyJson) {
      this.logger.warn(
        'FIREBASE_ADMIN_SDK_KEY is not set — Firebase SMS phone auth will not work. Set it in the Render dashboard.',
      );
      return;
    }

    try {
      const serviceAccount = JSON.parse(keyJson) as Record<string, unknown>;
      const projectId = String(serviceAccount.project_id);
      this.app = initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
      this.authInstance = getAuth(this.app);
      this.logger.log(
        `Firebase Admin SDK initialized for project ${projectId}. ` +
          'Credentials verified at startup are NOT a guarantee Phone Authentication is ' +
          'enabled in the console — that is a separate manual step.',
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize Firebase: ${(error as Error).message}. Check FIREBASE_ADMIN_SDK_KEY.`,
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.authInstance;
  }

  /**
   * Firebase Cloud Messaging for native push, from the same service account as
   * phone auth. Null until FIREBASE_ADMIN_SDK_KEY is set.
   */
  get messaging(): Messaging | null {
    return this.app ? getMessaging(this.app) : null;
  }

  private getAuth(): Auth {
    if (!this.authInstance) {
      throw new Error('Firebase is not configured');
    }
    return this.authInstance;
  }

  /**
   * Create a session cookie for an already-verified Firebase user (uid comes
   * from a verified ID token). Not used by the OTP flow directly, but kept
   * for a future web session use case.
   */
  async createSessionCookie(uid: string, expiresIn: number): Promise<string> {
    return this.getAuth().createSessionCookie(uid, { expiresIn });
  }

  /**
   * Verify a Firebase ID token returned by the client after it confirms the
   * phone OTP with Firebase directly (Firebase Auth SDK on the client sends
   * the SMS and does the OTP check; the server only verifies the resulting token).
   */
  async verifyIdToken(idToken: string) {
    try {
      return await this.getAuth().verifyIdToken(idToken);
    } catch (error) {
      throw new Error(`Invalid Firebase token: ${(error as Error).message}`);
    }
  }

  /** Looks up a Firebase user by phone number; returns null if none exists. */
  async getUserByPhoneNumber(phoneNumber: string) {
    try {
      return await this.getAuth().getUserByPhoneNumber(phoneNumber);
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/user-not-found') {
        return null;
      }
      throw error;
    }
  }

  /** Creates a new Firebase user record tied to a phone number. */
  async createUser(phoneNumber: string, displayName?: string) {
    return this.getAuth().createUser({ phoneNumber, displayName });
  }
}
