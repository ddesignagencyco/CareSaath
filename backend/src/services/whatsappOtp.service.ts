import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { NotificationChannel, NotificationStatus, UserRole, UserStatus } from '../generated/prisma/client.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { EmailService } from '../email/email.service.js';
import { renderNotificationEmail, WEB_URL } from '../email/templates.js';
import {
  clearAllBaileysAuthData,
  getBaileysSessionMeta,
  pruneStaleRecipientSessions,
  saveBaileysSessionMeta,
  usePrismaAuthState,
  type BaileysSessionMeta,
} from './baileys-db-auth.js';

export type WhatsAppConnectionState =
  | 'connected'
  | 'qr_ready'
  | 'connecting'
  | 'logged_out'
  | 'disconnected';

export interface WhatsAppAdminStatus {
  connected: boolean;
  status: WhatsAppConnectionState;
  qrDataUrl: string | null;
  qrUpdatedAt: string | null;
  user: { phone: string; name?: string } | null;
  lastDisconnectReason: string | null;
  linkedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  expiringSoon: boolean;
}

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000; // Notify admins 1 day before 30-day expiry
const MONITOR_INTERVAL_MS = 60 * 60 * 1000; // Check expiry & prune stale E2EE keys every 1 hour

let prismaRef: PrismaService | null = null;
let emailRef: EmailService | null = null;

let sock: WASocket | null = null;
let isConnected = false;
let isInitializing = false;
let connectionState: WhatsAppConnectionState = 'disconnected';
let latestQrDataUrl: string | null = null;
let latestQrUpdatedAt: string | null = null;
let connectedUser: { phone: string; name?: string } | null = null;
let lastDisconnectReason: string | null = null;
let sessionMeta: BaileysSessionMeta | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let monitorTimer: ReturnType<typeof setInterval> | null = null;

export interface SendWhatsAppOtpOptions {
  /** 'LOGIN' | 'SIGNUP' | 'TEST' | custom purpose */
  purpose?: string;
  /** Account holder's full name (first name is used for a warm personal greeting) */
  fullName?: string | null;
  /** OTP validity in minutes (defaults to 5) */
  ttlMinutes?: number;
}

function purposeCategoryLabel(purpose?: string): string {
  const key = (purpose ?? 'LOGIN').toUpperCase();
  const map: Record<string, string> = {
    LOGIN: 'login',
    SIGNUP: 'sign-up',
    BOOKING: 'booking',
    ONBOARDING: 'onboarding',
    VISIT_CHECKIN: 'visit check-in',
    CHANGE_PHONE: 'phone change',
    TEST: 'verification',
  };
  return map[key] ?? key.replace(/_/g, ' ').toLowerCase();
}

const OTP_TEMPLATES: Array<(otp: string, opts: SendWhatsAppOtpOptions) => string> = [
  (otp, opts) => {
    const ttl = Math.max(1, Math.round(opts.ttlMinutes ?? 5));
    const category = purposeCategoryLabel(opts.purpose);
    return `Your CareSaath ${category} verification code is *${otp}*. Valid for ${ttl} minute${ttl === 1 ? '' : 's'}. Never share this code with anyone.`;
  },
];

let templateIndex = 0;
let libsignalFilterInstalled = false;

/**
 * Suppresses noisy `libsignal` internal stdout dumps (`Closing session: SessionEntry { privKey... }`)
 * so Signal ratchet keys never clutter terminal or production log aggregators.
 */
function installLibsignalLogFilter(): void {
  if (libsignalFilterInstalled) return;
  libsignalFilterInstalled = true;

  const noisyPrefixes = [
    'Closing session:',
    'Opening session:',
    'Closing stale open session',
    'Removing old closed session:',
    'Migrating session to:',
  ];

  const isNoisy = (args: unknown[]): boolean => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    return noisyPrefixes.some((p) => first.startsWith(p));
  };

  const origInfo = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    if (isNoisy(args)) return;
    origInfo(...args);
  };

  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    if (isNoisy(args)) return;
    origLog(...args);
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function formatJidToPhone(jid: string | undefined): string {
  if (!jid) return '';
  const base = jid.split('@')[0]?.split(':')[0] ?? '';
  return base ? `+${base}` : '';
}

/**
 * Normalizes a phone number to international E.164 digits without `+`, spaces, or dashes.
 * Examples:
 *   "+92 300-1234567" -> "923001234567"
 *   "03001234567"     -> "923001234567"
 *   "3001234567"      -> "923001234567"
 */
export function normalizePhoneForBaileys(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `92${digits.slice(1)}`;
  }
  if (!digits.startsWith('92') && digits.length === 10) {
    return `92${digits}`;
  }
  return digits;
}

/**
 * Notifies all active ADMIN users (in-app notification feed + email if SMTP configured)
 * 1 day before the 30-day WhatsApp OTP session expires.
 */
async function notifyAdminsSessionExpiring(expiresAtIso: string): Promise<void> {
  if (!prismaRef) return;

  const admins = await prismaRef.user.findMany({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    select: { id: true, email: true, fullName: true },
  });
  if (admins.length === 0) return;

  const expiresFormatted = new Date(expiresAtIso).toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const title = 'WhatsApp OTP session expiring soon';
  const body = `Your linked WhatsApp OTP session will expire within 24 hours (${expiresFormatted}). Open Admin Settings to re-scan the QR code and avoid interruption.`;

  await prismaRef.notification
    .createMany({
      data: admins.map((a) => ({
        userId: a.id,
        channel: NotificationChannel.PUSH,
        event: 'whatsapp.session_expiring',
        title,
        body,
        payload: { expiresAt: expiresAtIso },
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      })),
    })
    .catch((err: Error) => {
      console.warn(`[WhatsAppOTP] Failed to create admin expiry notifications: ${err.message}`);
    });

  if (emailRef?.isConfigured) {
    const html = renderNotificationEmail({
      title,
      message: `${body} If the session expires before re-linking, CareSaath automatically falls back to Email OTP.`,
      variant: 'admin',
      facts: [
        ['Session expires', expiresFormatted],
        ['Fallback channel', 'Email OTP (automatic)'],
      ],
      action: { label: 'Open Admin Settings', url: `${WEB_URL}/admin/settings` },
    });
    for (const admin of admins) {
      if (!admin.email) continue;
      await emailRef.sendEmail(admin.email, `[CareSaath] ${title}`, html).catch((err: Error) => {
        console.warn(`[WhatsAppOTP] Expiry warning email to ${admin.email} failed: ${err.message}`);
      });
    }
  }

  console.warn(`[WhatsAppOTP] Sent 24-hour session expiry warning to ${admins.length} admin(s).`);
}

/**
 * Checks 30-day session expiry, sends 24-hour advance admin notification,
 * and prunes stale per-recipient E2EE session keys older than 7 days.
 */
async function runSessionMaintenance(): Promise<void> {
  if (!prismaRef) return;

  try {
    // 1. Prune stale recipient E2EE sessions (> 7 days old) so DB never bloats
    const pruned = await pruneStaleRecipientSessions(prismaRef, 7);
    if (pruned > 0) {
      console.log(`[WhatsAppOTP] Pruned ${pruned} stale recipient E2EE session row(s) from DB.`);
    }

    // 2. Enforce 30-day session lifecycle & 1-day advance warning
    const meta = await getBaileysSessionMeta(prismaRef);
    sessionMeta = meta;
    if (!meta) return;

    const remainingMs = new Date(meta.expiresAt).getTime() - Date.now();

    if (remainingMs <= 0) {
      console.warn('[WhatsAppOTP] 30-day WhatsApp session expired. Resetting session for fresh QR scan.');
      await logoutWhatsApp();
      return;
    }

    if (remainingMs <= EXPIRY_WARNING_MS && !meta.expiryNotified) {
      await notifyAdminsSessionExpiring(meta.expiresAt);
      const updated: BaileysSessionMeta = { ...meta, expiryNotified: true };
      await saveBaileysSessionMeta(prismaRef, updated);
      sessionMeta = updated;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[WhatsAppOTP] Maintenance check failed: ${msg}`);
  }
}

function startSessionMonitor(): void {
  if (monitorTimer) return;
  monitorTimer = setInterval(() => {
    void runSessionMaintenance();
  }, MONITOR_INTERVAL_MS);
  monitorTimer.unref();
}

/**
 * Initializes a single persistent Baileys WhatsApp Web socket connection
 * backed by PostgreSQL (`PlatformConfig`) with zero local disk files.
 */
export async function initWhatsApp(
  prisma?: PrismaService,
  email?: EmailService,
): Promise<void> {
  if (prisma) prismaRef = prisma;
  if (email) emailRef = email;
  if (!prismaRef) {
    console.warn('[WhatsAppOTP] PrismaService not provided; skipping WhatsApp initialization.');
    return;
  }

  if (isInitializing) return;
  installLibsignalLogFilter();
  startSessionMonitor();
  isInitializing = true;
  clearReconnectTimer();
  connectionState = 'connecting';

  try {
    // Check if an existing stored session has already passed its 30-day expiry
    const existingMeta = await getBaileysSessionMeta(prismaRef);
    sessionMeta = existingMeta;
    if (existingMeta && new Date(existingMeta.expiresAt).getTime() <= Date.now()) {
      console.warn('[WhatsAppOTP] Stored 30-day session expired on boot; clearing DB session.');
      await clearAllBaileysAuthData(prismaRef);
      sessionMeta = null;
    }

    const { state, saveCreds } = await usePrismaAuthState(prismaRef);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      syncFullHistory: false,
    });

    sock = socket;

    socket.ev.on('creds.update', () => {
      if (socket !== sock) return;
      void saveCreds().catch((err: Error) => {
        console.warn(`[WhatsAppOTP] Failed to save creds to PostgreSQL: ${err.message}`);
      });
    });

    socket.ev.on('connection.update', (update) => {
      if (socket !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionState = 'qr_ready';
        latestQrUpdatedAt = new Date().toISOString();
        void QRCode.toDataURL(qr, { width: 320, margin: 2 })
          .then((url) => {
            latestQrDataUrl = url;
          })
          .catch(() => {
            latestQrDataUrl = null;
          });

        console.log('\n==============================================================');
        console.log('📱 Scan this QR code via WhatsApp -> Linked Devices to connect');
        console.log('   the Caresaath OTP sender number (or open /admin/settings):');
        console.log('==============================================================\n');
        qrcodeTerminal.generate(qr, { small: true });
      }

      if (connection === 'open') {
        isConnected = true;
        connectionState = 'connected';
        latestQrDataUrl = null;
        latestQrUpdatedAt = null;
        lastDisconnectReason = null;
        connectedUser = {
          phone: formatJidToPhone(socket.user?.id),
          name: socket.user?.name,
        };
        console.log('[WhatsAppOTP] WhatsApp OTP service connected (PostgreSQL auth state)');

        // Initialize 30-day session window if newly linked
        if (prismaRef) {
          void (async () => {
            const currentMeta = await getBaileysSessionMeta(prismaRef!);
            if (!currentMeta) {
              const now = Date.now();
              const freshMeta: BaileysSessionMeta = {
                linkedAt: new Date(now).toISOString(),
                expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
                expiryNotified: false,
              };
              await saveBaileysSessionMeta(prismaRef!, freshMeta);
              sessionMeta = freshMeta;
            } else {
              sessionMeta = currentMeta;
            }
            await runSessionMaintenance();
          })();
        }
      }

      if (connection === 'close') {
        isConnected = false;
        connectedUser = null;
        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;

        if (statusCode !== DisconnectReason.loggedOut) {
          connectionState = 'disconnected';
          lastDisconnectReason = `Connection closed (status=${statusCode ?? 'unknown'})`;
          console.warn(`[WhatsAppOTP] ${lastDisconnectReason}. Reconnecting in 3s...`);
          clearReconnectTimer();
          reconnectTimer = setTimeout(() => {
            void initWhatsApp();
          }, 3000);
        } else {
          sock = null;
          connectionState = 'logged_out';
          latestQrDataUrl = null;
          lastDisconnectReason = 'Session logged out (401). Re-scan QR code in Admin Settings.';
          console.error(
            '[WhatsAppOTP] CRITICAL: WhatsApp session logged out (401). Open /admin/settings to re-scan the QR code.',
          );
          if (prismaRef) {
            void clearAllBaileysAuthData(prismaRef).then(() => {
              sessionMeta = null;
            });
          }
        }
      }
    });
  } catch (err) {
    isConnected = false;
    connectionState = 'disconnected';
    const msg = err instanceof Error ? err.message : String(err);
    lastDisconnectReason = msg;
    console.warn(`[WhatsAppOTP] Initialization failed: ${msg}. Retrying in 5s...`);
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      void initWhatsApp();
    }, 5000);
  } finally {
    isInitializing = false;
  }
}

/**
 * Requests an 8-character WhatsApp Web pairing code for linking a sender number
 * without scanning a QR code (WhatsApp -> Linked Devices -> Link with phone number).
 */
export async function requestWhatsAppPairingCode(phone: string): Promise<string> {
  if (isConnected) {
    throw new Error('WhatsApp is already connected. Disconnect first to link a different number.');
  }

  const cleanPhone = normalizePhoneForBaileys(phone);
  if (cleanPhone.length < 10) {
    throw new Error('Enter a valid phone number with country code (e.g. +923001234567)');
  }

  // Ensure a fresh unregistered socket is active before requesting a pairing code
  if (!sock || connectionState === 'logged_out' || connectionState === 'disconnected') {
    await reconnectWhatsApp();
  }

  // Wait up to 6 seconds for the socket instance to be ready
  for (let i = 0; i < 12 && !sock; i += 1) {
    await delay(500);
  }

  if (!sock) {
    throw new Error('WhatsApp socket is still initializing. Please try again in a moment.');
  }

  const rawCode = await sock.requestPairingCode(cleanPhone);
  const formatted = rawCode.length === 8 ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : rawCode;
  return formatted;
}

/**
 * Forces a fresh socket reconnect (for Admin Settings "Reconnect").
 */
export async function reconnectWhatsApp(): Promise<WhatsAppAdminStatus> {
  clearReconnectTimer();
  const prevSock = sock;
  sock = null;
  if (prevSock) {
    try {
      await prevSock.end(undefined);
    } catch {
      // ignore close errors
    }
  }
  isConnected = false;
  connectedUser = null;
  latestQrDataUrl = null;
  latestQrUpdatedAt = null;
  lastDisconnectReason = null;
  connectionState = 'connecting';
  void initWhatsApp();
  return getWhatsAppAdminStatus();
}

/**
 * Logs out the current WhatsApp session, wipes all `baileys.*` rows in PostgreSQL,
 * and starts a fresh QR pairing session.
 */
export async function logoutWhatsApp(): Promise<void> {
  clearReconnectTimer();
  const prevSock = sock;
  sock = null;
  if (prevSock) {
    try {
      await prevSock.logout();
    } catch {
      try {
        await prevSock.end(undefined);
      } catch {
        // ignore
      }
    }
  }
  isConnected = false;
  connectedUser = null;
  latestQrDataUrl = null;
  latestQrUpdatedAt = null;
  sessionMeta = null;
  connectionState = 'connecting';
  lastDisconnectReason = null;

  if (prismaRef) {
    await clearAllBaileysAuthData(prismaRef).catch(() => { });
  }

  reconnectTimer = setTimeout(() => {
    void initWhatsApp();
  }, 1000);
}

/**
 * Sends a WhatsApp OTP message to the given phone number via the active Baileys socket.
 * Throws an Error if disconnected, unregistered on WhatsApp, or if delivery fails.
 */
export async function sendWhatsAppOtp(
  phone: string,
  otp: string,
  opts: SendWhatsAppOtpOptions = {},
): Promise<void> {
  if (!isConnected || !sock) {
    throw new Error('WhatsApp socket not connected');
  }

  const cleanPhone = normalizePhoneForBaileys(phone);
  if (cleanPhone.length < 10) {
    throw new Error(`Invalid phone number for WhatsApp: ${phone}`);
  }

  const jid = `${cleanPhone}@s.whatsapp.net`;

  const lookup = await sock.onWhatsApp(jid);
  const result = lookup?.[0];
  if (!result?.exists) {
    throw new Error('Phone number is not registered on WhatsApp');
  }

  const targetJid = result.jid || jid;

  // Simulate natural typing before sending to reduce ban risk
  await sock.sendPresenceUpdate('composing', targetJid);
  await delay(1500);
  await sock.sendPresenceUpdate('paused', targetJid);

  const buildMessage = OTP_TEMPLATES[templateIndex % OTP_TEMPLATES.length];
  templateIndex += 1;

  await sock.sendMessage(targetJid, { text: buildMessage(otp, opts) });
}

/**
 * Sends a general CareSaath notification message over the active Baileys WhatsApp socket.
 * Throws if disconnected, invalid phone, or recipient is not on WhatsApp.
 */
export async function sendWhatsAppNotification(phone: string, text: string): Promise<void> {
  if (!isConnected || !sock) {
    throw new Error('WhatsApp socket not connected');
  }

  const cleanPhone = normalizePhoneForBaileys(phone);
  if (cleanPhone.length < 10) {
    throw new Error(`Invalid phone number for WhatsApp: ${phone}`);
  }

  const jid = `${cleanPhone}@s.whatsapp.net`;
  const lookup = await sock.onWhatsApp(jid);
  const result = lookup?.[0];
  if (!result?.exists) {
    throw new Error('Phone number is not registered on WhatsApp');
  }

  const targetJid = result.jid || jid;
  await sock.sendMessage(targetJid, { text });
}

/**
 * Returns minimal connection status.
 */
export function getWhatsAppStatus(): { connected: boolean } {
  return { connected: isConnected };
}

/**
 * Detailed status (including QR data URL and 30-day session countdown) for Admin Settings.
 */
export function getWhatsAppAdminStatus(): WhatsAppAdminStatus {
  let daysRemaining: number | null = null;
  let expiringSoon = false;

  if (isConnected && sessionMeta?.expiresAt) {
    const remainingMs = new Date(sessionMeta.expiresAt).getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    expiringSoon = remainingMs <= EXPIRY_WARNING_MS;
  }

  return {
    connected: isConnected,
    status: connectionState,
    qrDataUrl: latestQrDataUrl,
    qrUpdatedAt: latestQrUpdatedAt,
    user: connectedUser,
    lastDisconnectReason,
    linkedAt: sessionMeta?.linkedAt ?? null,
    expiresAt: sessionMeta?.expiresAt ?? null,
    daysRemaining,
    expiringSoon,
  };
}
