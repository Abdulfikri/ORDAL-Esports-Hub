import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import type {
  AuditAction,
  AuditIntegrityReport,
  AuditLogEntry,
  AuditResource,
  AuthUser,
  BrandSettings,
  CasterWithdrawal,
  GatewayChannel,
  GatewayProvider,
  HeroSettings,
  Match,
  NewsArticle,
  OrdalDatabase,
  PaymentHistoryEvent,
  PaymentMethod,
  PaymentRecord,
  ProductionSecurityCheck,
  ScrimGame,
  ScrimSession,
  ScrimSettings,
  SettlementLedgerEntry,
  Shoutcaster,
  SocActiveSession,
  SocEventStatus,
  Squad,
  TeamProfile,
  Tournament,
  UserRole,
} from './src/types.ts';
import {
  blockIpAddress,
  buildSocOverview,
  clearSocLoginFailures,
  getClientIp,
  handleSocLoginFailure,
  isLoopbackIp,
  loadSocStore,
  recordSocEvent,
  socProtectionMiddleware,
  unblockIpAddress,
  updateSocEventStatus,
  updateSocPolicy,
} from './socSecurity.ts';

const PLATFORM_LOBBY_FEE = 50000;

const DEFAULT_SCRIM_SETTINGS: ScrimSettings = {
  defaultLobbyFee: PLATFORM_LOBBY_FEE,
  lobbyFeeByGame: {},
  updatedAt: '2026-11-18T12:00:00.000Z',
};

function getEffectiveLobbyFee(
  db: Pick<OrdalDatabase, 'scrimSettings'>,
  game?: ScrimGame | string
): number {
  const settings = db.scrimSettings;
  if (settings && game && settings.lobbyFeeByGame) {
    const perGame = settings.lobbyFeeByGame[game as ScrimGame];
    if (typeof perGame === 'number' && Number.isFinite(perGame) && perGame >= 0) {
      return Math.round(perGame);
    }
  }
  if (
    settings &&
    typeof settings.defaultLobbyFee === 'number' &&
    Number.isFinite(settings.defaultLobbyFee) &&
    settings.defaultLobbyFee >= 0
  ) {
    return Math.round(settings.defaultLobbyFee);
  }
  return PLATFORM_LOBBY_FEE;
}

const DEFAULT_HERO_SETTINGS: HeroSettings = {
  eyebrowPrimary: 'ORDAL COMPETITIVE ESPORTS HUB',
  eyebrowSecondary: 'POINT BLANK · FREE FIRE · EFOOTBALL',
  headline: '',
  subtitle: '',
  primaryCtaLabel: 'Register Squad',
  secondaryCtaLabel: 'Lihat Turnamen',
  secondaryCtaHref: '#turnamen',
  featuredTournamentId: '',
  backgroundImageUrl: '',
  updatedAt: '2026-11-18T12:00:00.000Z',
};

const DEFAULT_BRAND_SETTINGS: BrandSettings = {
  wordmarkUrl: '',
  monogramUrl: '',
  faviconUrl: '',
  brandName: 'ORDAL Esports Hub',
  updatedAt: '2026-11-18T12:00:00.000Z',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

interface SessionRecord {
  userId: string;
  role: UserRole;
  expiresAt: number;
  lastActivityAt: number;
  createdAt: number;
  lastRotatedAt: number;
  ipPrefix: string;
  uaHash: string;
}

interface StoredUser extends AuthUser {
  passwordHash: string;
  totpEnabled?: boolean;
  totpSecret?: string;
  totpPendingSecret?: string;
  totpLastUsedStep?: number;
  totpRecoveryHashes?: string[];
}

interface PasswordResetRecord {
  userId: string;
  email: string;
  role: 'TEAM' | 'CASTER';
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

interface AuthStore {
  users: StoredUser[];
  sessions: Record<string, SessionRecord>; // sha256(token) -> SessionRecord
  passwordResets?: Record<string, PasswordResetRecord>;
  adminClaimed?: boolean;
  csrfSecret?: string;
}

function normalizeEnvValue(raw: string | undefined): string {
  let val = (raw || '').trim();
  if (
    (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
    (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

function isPlaceholderEnvValue(val: string): boolean {
  if (!val) return true;
  const lower = val.toLowerCase();
  return (
    lower === 'secret value' ||
    lower === 'your_secret_here' ||
    lower === 'placeholder' ||
    val.startsWith('CHANGE_ME_') ||
    val.startsWith('MY_')
  );
}

function getConfiguredEnvSecret(envKey: string): string | null {
  const val = normalizeEnvValue(process.env[envKey]);
  if (isPlaceholderEnvValue(val)) return null;
  return val;
}

const SESSION_COOKIE_NAME = 'ordal_sid';
const CSRF_COOKIE_NAME = 'ordal_csrf';
const SESSION_TTL_HOURS = Math.max(1, Number(getConfiguredEnvSecret('AUTH_SESSION_TTL_HOURS')) || 24);
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_HOURS = Math.max(
  1,
  Math.min(SESSION_TTL_HOURS, Number(getConfiguredEnvSecret('ADMIN_SESSION_TTL_HOURS')) || 8)
);
const ADMIN_SESSION_TTL_MS = ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000;
const INACTIVITY_TIMEOUT_MINUTES = Math.max(
  1,
  Number(getConfiguredEnvSecret('AUTH_INACTIVITY_TIMEOUT_MINUTES')) || 30
);
const INACTIVITY_TIMEOUT_MS = INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
let cachedRuntimeCsrfSecret: string | null =
  getConfiguredEnvSecret('AUTH_SESSION_SECRET') || getConfiguredEnvSecret('SESSION_SECRET') || null;
const ROTATED_REPLAY_WINDOW_MS = 15 * 60 * 1000;
const ROTATED_GRACE_WINDOW_MS = 5 * 1000;
const recentlyRotatedTokens = new Map<
  string,
  { userId: string; invalidatedAt: number; ipPrefix: string; uaHash: string }
>();

function hashPassword(password: string, customSalt?: string): string {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, storedHash: string): { valid: boolean; needsUpgrade: boolean } {
  if (!storedHash) return { valid: false, needsUpgrade: false };
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return { valid: false, needsUpgrade: false };
    const [, salt, expectedHex] = parts;
    const derivedBuf = crypto.scryptSync(password, salt, 32);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derivedBuf.length !== expectedBuf.length) return { valid: false, needsUpgrade: false };
    return { valid: crypto.timingSafeEqual(derivedBuf, expectedBuf), needsUpgrade: false };
  }
  // Legacy hash verification only when AUTH_LEGACY_SALT is explicitly configured in environment
  const legacySalt = getConfiguredEnvSecret('AUTH_LEGACY_SALT');
  if (!legacySalt) return { valid: false, needsUpgrade: false };
  const derivedBuf = crypto.scryptSync(password, legacySalt, 32);
  const expectedBuf = Buffer.from(storedHash, 'hex');
  if (derivedBuf.length !== expectedBuf.length) return { valid: false, needsUpgrade: false };
  const valid = crypto.timingSafeEqual(derivedBuf, expectedBuf);
  return { valid, needsUpgrade: valid };
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const mfaChallenges = new Map<
  string,
  {
    userId: string;
    expiresAt: number;
    attempts: number;
    ipPrefix: string;
    uaHash: string;
  }
>();

function generateBase32Secret(byteLen = 20): string {
  const bytes = crypto.randomBytes(byteLen);
  let out = '';
  let buffer = 0;
  let bitsLeft = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      out += BASE32_ALPHABET[(buffer >>> (bitsLeft - 5)) & 31];
      bitsLeft -= 5;
    }
  }
  if (bitsLeft > 0) {
    out += BASE32_ALPHABET[(buffer << (5 - bitsLeft)) & 31];
  }
  return out;
}

function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpCode(secretBase32: string, stepCounter: number): string {
  const key = base32ToBuffer(secretBase32);
  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(stepCounter / 0x100000000);
  const low = stepCounter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 1_000_000).padStart(6, '0');
}

function verifyTotpCode(
  secretBase32: string,
  rawCode: string,
  lastUsedStep?: number
): { valid: boolean; matchedStep?: number; replayed?: boolean } {
  const code = rawCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const currentStep = Math.floor(Date.now() / 30000);
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + offset;
    const expected = generateTotpCode(secretBase32, step);
    const aBuf = Buffer.from(code, 'utf8');
    const bBuf = Buffer.from(expected, 'utf8');
    if (aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf)) {
      if (lastUsedStep !== undefined && step <= lastUsedStep) {
        return { valid: false, replayed: true };
      }
      return { valid: true, matchedStep: step };
    }
  }
  return { valid: false };
}

function hashRecoveryCode(code: string, userId: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto
    .createHash('sha256')
    .update(`ordal-recovery:${userId}:${normalized}`)
    .digest('hex');
}

function generateRecoveryCodes(userId: string, count = 6): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
    const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
    const formatted = `${partA}-${partB}`;
    plain.push(formatted);
    hashes.push(hashRecoveryCode(formatted, userId));
  }
  return { plain, hashes };
}

function hasValidImageMagicBytes(mimeSubtype: string, base64Payload: string): boolean {
  try {
    const sample = base64Payload.slice(0, 64);
    const alignedLen = sample.length >= 16 ? sample.length - (sample.length % 4) : sample.length;
    const bytes = Buffer.from(sample.slice(0, alignedLen), 'base64');
    const type = mimeSubtype.toLowerCase();
    if (type === 'png') {
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    }
    if (type === 'jpeg' || type === 'jpg') {
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (type === 'webp') {
      return (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  } catch {
    return false;
  }
}

function sanitizeImageUrl(raw: unknown): { ok: boolean; value?: string; error?: string } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: true, value: undefined };
  }
  const str = String(raw).trim();
  if (str.length > 3 * 1024 * 1024) {
    return { ok: false, error: 'Ukuran file gambar terlalu besar. Maksimal 2 MB.' };
  }
  const dataMatch = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(str);
  if (dataMatch) {
    if (!hasValidImageMagicBytes(dataMatch[1], dataMatch[2])) {
      return {
        ok: false,
        error: 'Header biner gambar tidak valid (file bukan PNG, JPG, atau WEBP asli).',
      };
    }
    return { ok: true, value: str };
  }
  try {
    const parsed = new URL(str);
    if (parsed.protocol === 'https:') {
      return { ok: true, value: str };
    }
  } catch {
    // invalid URL
  }
  return {
    ok: false,
    error: 'Format gambar tidak aman. Hanya mendukung JPG, PNG, WEBP, atau URL HTTPS.',
  };
}

async function verifyTurnstileIfConfigured(
  req: express.Request
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const secret = getConfiguredEnvSecret('TURNSTILE_SECRET_KEY');
  if (!secret) return { ok: true };
  const token = String(
    req.body?.captchaToken || req.body?.['cf-turnstile-response'] || ''
  ).trim();
  if (!token) {
    return {
      ok: false,
      status: 400,
      error: 'Verifikasi keamanan anti-bot wajib diselesaikan terlebih dahulu.',
    };
  }
  try {
    const form = new URLSearchParams({
      secret,
      response: token,
      remoteip: getClientIp(req),
    });
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(4000),
    });
    const result = (await verifyRes.json()) as { success?: boolean };
    if (!result.success) {
      recordSocEvent({
        severity: 'MEDIUM',
        category: 'RATE_LIMIT',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        userAgent: String(req.headers['user-agent'] || ''),
        summary: `Verifikasi anti-bot Turnstile gagal pada ${req.method} ${req.path}.`,
      });
      return {
        ok: false,
        status: 403,
        error: 'Verifikasi keamanan anti-bot gagal. Silakan coba lagi.',
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Layanan verifikasi anti-bot sedang sibuk. Silakan coba sesaat lagi.',
    };
  }
}

async function sendPasswordResetEmailIfConfigured(
  email: string,
  code: string,
  role: 'TEAM' | 'CASTER'
): Promise<boolean> {
  const apiKey = getConfiguredEnvSecret('RESEND_API_KEY');
  const from = getConfiguredEnvSecret('EMAIL_FROM');
  if (!apiKey || !from) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `[ORDAL Esports] Kode Reset Password (${code})`,
        html: `<div style="font-family:sans-serif;background:#0A0C10;color:#F8FAFC;padding:24px;border-radius:8px;"><h2 style="color:#00F0FF;margin-top:0;">ORDAL Esports Hub</h2><p>Permintaan atur ulang password untuk akun <strong>${role}</strong> (${email}).</p><p>Gunakan kode verifikasi 6 digit berikut (berlaku 10 menit):</p><div style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#CCFF00;background:#12161F;padding:12px 18px;display:inline-block;border-radius:6px;">${code}</div><p style="font-size:12px;color:#94A3B8;margin-top:16px;">Abaikan email ini jika Anda tidak meminta reset password.</p></div>`,
        text: `ORDAL Esports Hub - Kode Reset Password (${role}): ${code} (berlaku 10 menit).`,
      }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function createRateLimiter(maxRequests: number, windowMs: number, errorMessage: string): express.RequestHandler {
  const buckets = new Map<string, number[]>();
  return (req, res, next) => {
    const key = getClientIp(req);
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      recordSocEvent({
        severity: 'MEDIUM',
        category: 'RATE_LIMIT',
        ip: key,
        method: req.method,
        path: req.path,
        userAgent: String(req.headers['user-agent'] || ''),
        summary: `Rate limit terlampaui (${maxRequests} req) pada ${req.method} ${req.path}.`,
      });
      return res.status(429).json({ error: errorMessage });
    }
    recent.push(now);
    buckets.set(key, recent);
    next();
  };
}

function sanitizePaymentsForRole(
  payments: PaymentRecord[],
  db: OrdalDatabase,
  authUser: StoredUser | null
): PaymentRecord[] {
  if (!authUser) return [];
  if (authUser.role === 'SUPER_ADMIN') return payments;

  if (authUser.role === 'TEAM') {
    const teamNameLower = (authUser.teamProfile?.teamName || authUser.displayName || '')
      .trim()
      .toLowerCase();
    const userEmailLower = authUser.email.trim().toLowerCase();
    return payments.filter((p) => {
      if (p.category === 'CASTER_PAYOUT') return false;
      if (p.payerEmail && p.payerEmail.toLowerCase() === userEmailLower) return true;
      if (teamNameLower && p.payerName.trim().toLowerCase() === teamNameLower) return true;
      if (
        p.category === 'SCRIM_REFUND' &&
        teamNameLower &&
        p.receiverName.trim().toLowerCase() === teamNameLower
      ) {
        return true;
      }
      if (p.scrimId) {
        const sc = (db.scrims || []).find((s) => s.id === p.scrimId);
        if (sc) {
          if (p.scrimSide === 'host' && sc.hostTeamName.trim().toLowerCase() === teamNameLower) {
            return true;
          }
          if (
            p.scrimSide === 'challenger' &&
            sc.challengerTeamName.trim().toLowerCase() === teamNameLower
          ) {
            return true;
          }
        }
      }
      return false;
    });
  }

  if (authUser.role === 'CASTER' && authUser.casterId) {
    return payments
      .filter((p) => p.casterId === authUser.casterId && p.category !== 'SCRIM_REFUND')
      .map((p) => {
        if (p.category === 'SCRIM_SPLIT_BILL') {
          const casterShare = p.casterFeeShare ?? p.amount;
          return {
            ...p,
            amount: casterShare,
            baseAmount: casterShare,
            gatewayFee: 0,
            platformFeeShare: 0,
            lineItems: [{ label: 'Bagian Honor Shoutcaster (50%)', amount: casterShare }],
          };
        }
        return p;
      });
  }

  return [];
}

function sanitizeLedgerForRole(
  ledger: SettlementLedgerEntry[],
  db: OrdalDatabase,
  authUser: StoredUser | null
): SettlementLedgerEntry[] {
  if (!authUser) return [];
  if (authUser.role === 'SUPER_ADMIN') return ledger;

  if (authUser.role === 'CASTER' && authUser.casterId) {
    return ledger.filter(
      (l) => l.casterId === authUser.casterId && l.accountBucket === 'CASTER_PAYABLE'
    );
  }

  if (authUser.role === 'TEAM') {
    const ownedPaymentIds = new Set(
      sanitizePaymentsForRole(db.payments || [], db, authUser).map((p) => p.id)
    );
    return ledger.filter(
      (l) =>
        ownedPaymentIds.has(l.paymentId) &&
        (l.accountBucket === 'ESCROW_TEAM' || l.accountBucket === 'REFUND_PAYABLE')
    );
  }

  return [];
}

function sanitizeStateForRole(db: OrdalDatabase, authUser: StoredUser | null): OrdalDatabase {
  // Super Admin has full internal visibility
  if (authUser?.role === 'SUPER_ADMIN') {
    return db;
  }

  // League Ops has tournament operations visibility (including squad captain contact for check-in),
  // but zero visibility into financials, payouts, scrim settings, or internal audit logs.
  if (authUser?.role === 'LEAGUE_OPS') {
    return {
      ...db,
      withdrawals: [],
      payments: [],
      ledger: [],
      scrimSettings: undefined,
      auditLogs: [],
    };
  }

  // Filter withdrawals strictly by ownership (public & TEAM never see banking/e-wallet PII)
  const safeWithdrawals =
    authUser?.role === 'CASTER' && authUser.casterId
      ? (db.withdrawals || []).filter((w) => w.casterId === authUser.casterId)
      : [];

  // Redact personal captain contacts (WA / Discord) for non-owners
  const teamNameLower = authUser?.role === 'TEAM' ? (authUser.teamProfile?.teamName || '').toLowerCase() : '';
  const teamTagLower = authUser?.role === 'TEAM' ? (authUser.teamProfile?.teamTag || '').toLowerCase() : '';

  const safeSquads = (db.squads || []).map((sq) => {
    const isOwnTeam =
      authUser?.role === 'TEAM' &&
      ((teamNameLower && sq.name.toLowerCase() === teamNameLower) ||
        (teamTagLower && sq.tag.toLowerCase() === teamTagLower));
    if (isOwnTeam) return sq;
    return {
      ...sq,
      captainContact: '',
    };
  });

  // Redact scrim user emails, applicant emails, and refund bank details for non-owners
  const safeScrims = (db.scrims || []).map((sc) => sanitizeScrimForRole(sc, authUser));
  const safePayments = sanitizePaymentsForRole(db.payments || [], db, authUser);
  const safeLedger = sanitizeLedgerForRole(db.ledger || [], db, authUser);

  return {
    ...db,
    squads: safeSquads,
    scrims: safeScrims,
    withdrawals: safeWithdrawals,
    payments: safePayments,
    ledger: safeLedger,
    scrimSettings: authUser?.role === 'CASTER' ? undefined : db.scrimSettings,
    auditLogs: [],
  };
}

function isScrimHostUser(scrim: ScrimSession, user: StoredUser | null): boolean {
  if (!user || user.role !== 'TEAM') return false;
  if (scrim.hostUserId && scrim.hostUserId === user.id) return true;
  if (scrim.hostUserEmail && scrim.hostUserEmail.toLowerCase() === user.email.toLowerCase()) {
    return true;
  }
  const myTeamName = (user.teamProfile?.teamName || user.displayName || '').trim().toLowerCase();
  return Boolean(myTeamName) && scrim.hostTeamName.trim().toLowerCase() === myTeamName;
}

function isScrimChallengerUser(scrim: ScrimSession, user: StoredUser | null): boolean {
  if (!user || user.role !== 'TEAM') return false;
  if (scrim.challengerUserId && scrim.challengerUserId === user.id) return true;
  if (
    scrim.challengerUserEmail &&
    scrim.challengerUserEmail.toLowerCase() === user.email.toLowerCase()
  ) {
    return true;
  }
  const myTeamName = (user.teamProfile?.teamName || user.displayName || '').trim().toLowerCase();
  return (
    Boolean(myTeamName) &&
    Boolean(scrim.challengerTeamName) &&
    scrim.challengerTeamName.trim().toLowerCase() === myTeamName
  );
}

function sanitizeScrimForRole(sc: ScrimSession, authUser: StoredUser | null): ScrimSession {
  if (authUser?.role === 'SUPER_ADMIN') {
    return sc;
  }
  const isHost = isScrimHostUser(sc, authUser);
  const isChallenger = isScrimChallengerUser(sc, authUser);
  const userEmailLower = authUser?.email?.trim().toLowerCase() || '';

  const safeApps = (sc.challengerApplications || []).map((appItem) => {
    const isApplicant =
      Boolean(authUser) &&
      (appItem.applicantUserId === authUser!.id ||
        (userEmailLower && appItem.applicantEmail.toLowerCase() === userEmailLower));
    if (isHost || isApplicant) {
      return appItem;
    }
    return {
      ...appItem,
      applicantUserId: '',
      applicantEmail: '',
    };
  });

  const safeRefunds = (sc.refundRequests || [])
    .filter((r) => {
      if (!authUser || authUser.role !== 'TEAM') return false;
      if (userEmailLower && r.requestedByEmail.toLowerCase() === userEmailLower) return true;
      if (isHost && r.side === 'host') return true;
      if (isChallenger && r.side === 'challenger') return true;
      return false;
    })
    .map((r) => ({
      ...r,
      accountNumber:
        r.accountNumber.length > 4
          ? `${'*'.repeat(Math.max(4, r.accountNumber.length - 4))}${r.accountNumber.slice(-4)}`
          : r.accountNumber,
    }));

  const baseSanitized: ScrimSession = {
    ...sc,
    hostUserId: isHost ? sc.hostUserId : undefined,
    hostUserEmail: isHost ? sc.hostUserEmail : undefined,
    challengerUserId: isChallenger ? sc.challengerUserId : undefined,
    challengerUserEmail: isChallenger ? sc.challengerUserEmail : undefined,
    challengerApplications: safeApps,
    refundRequests: safeRefunds,
  };

  if (authUser?.role === 'CASTER') {
    return {
      ...baseSanitized,
      platformFee: 0,
      totalCost: sc.casterRate,
      splitCostPerTeam: Math.round(sc.casterRate / 2),
    };
  }
  return baseSanitized;
}

function getConfiguredSeedEmail(envKey: string, fallback: string): string {
  const val = getConfiguredEnvSecret(envKey);
  if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    return val.toLowerCase();
  }
  return fallback;
}

function resolveSeedPassword(envKey: string): string {
  const fromEnv = getConfiguredEnvSecret(envKey);
  if (fromEnv) {
    return fromEnv;
  }
  // Generate a strong random password at runtime if env var is not configured
  return crypto.randomBytes(16).toString('base64url');
}

function createSeedAuthStore(): AuthStore {
  const adminEmail = getConfiguredSeedEmail('SEED_ADMIN_EMAIL', 'admin@ordal.gg');
  const caster1Email = getConfiguredSeedEmail('SEED_CASTER_1_EMAIL', 'yosafat@ordal.gg');
  const caster2Email = getConfiguredSeedEmail('SEED_CASTER_2_EMAIL', 'rymot@ordal.gg');
  const caster3Email = getConfiguredSeedEmail('SEED_CASTER_3_EMAIL', 'vortex@ordal.gg');
  const teamEmail = getConfiguredSeedEmail('SEED_TEAM_EMAIL', 'team@ordal.gg');

  const adminPassword = resolveSeedPassword('SEED_ADMIN_PASSWORD');
  const casterPassword = resolveSeedPassword('SEED_CASTER_PASSWORD');
  const teamPassword = resolveSeedPassword('SEED_TEAM_PASSWORD');

  const leagueOpsEmail = getConfiguredSeedEmail('SEED_LEAGUE_OPS_EMAIL', 'leagueops@ordal.gg');
  const leagueOpsPassword = getConfiguredEnvSecret('SEED_LEAGUE_OPS_PASSWORD');

  const users: StoredUser[] = [
    {
      id: 'usr-admin-01',
      email: adminEmail,
      displayName: 'Super Admin ORDAL',
      role: 'SUPER_ADMIN',
      passwordHash: hashPassword(adminPassword),
    },
    {
      id: 'usr-caster-01',
      email: caster1Email,
      displayName: 'Yosafat Putra Asa',
      role: 'CASTER',
      casterId: 'cst-001',
      passwordHash: hashPassword(casterPassword),
    },
    {
      id: 'usr-caster-02',
      email: caster2Email,
      displayName: 'Aldin "Rymot" Endaryan',
      role: 'CASTER',
      casterId: 'cst-002',
      passwordHash: hashPassword(casterPassword),
    },
    {
      id: 'usr-caster-03',
      email: caster3Email,
      displayName: 'Raka "Vortex" Pratama',
      role: 'CASTER',
      casterId: 'cst-003',
      passwordHash: hashPassword(casterPassword),
    },
    {
      id: 'usr-team-01',
      email: teamEmail,
      displayName: 'ORDAL VANGUARD',
      role: 'TEAM',
      passwordHash: hashPassword(teamPassword),
      teamProfile: {
        teamName: 'ORDAL VANGUARD',
        teamTag: 'ORD',
        teamLogo: '',
        primaryGame: 'POINT BLANK',
        captainIgn: 'ORD_Kuro#01',
        captainContact: 'Discord: kuro#0001',
        rosterCore: [
          'ORD_Kuro#01',
          'ORD_Rex#02',
          'ORD_Vyn#03',
          'ORD_Zed#04',
          'ORD_Lynx#05',
        ],
        rosterSub: ['ORD_Seno#06'],
      },
    },
  ];

  if (leagueOpsPassword) {
    users.push({
      id: 'usr-leagueops-01',
      email: leagueOpsEmail,
      displayName: 'League Ops Turnamen',
      role: 'LEAGUE_OPS',
      passwordHash: hashPassword(leagueOpsPassword),
    });
  }

  return {
    users,
    sessions: {},
    adminClaimed: Boolean(getConfiguredEnvSecret('SEED_ADMIN_PASSWORD')),
  };
}

function loadAuthStore(): AuthStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AUTH_FILE)) {
    const seed = createSeedAuthStore();
    writeFileAtomic(AUTH_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')) as AuthStore;
    if (!Array.isArray(parsed.users)) {
      const seed = createSeedAuthStore();
      saveAuthStore(seed);
      return seed;
    }
    const cleanSessions: Record<string, SessionRecord> = {};
    let mutated = false;
    const rawSessions = (parsed as unknown as { sessions?: Record<string, unknown> }).sessions;
    if (rawSessions && typeof rawSessions === 'object') {
      for (const [key, val] of Object.entries(rawSessions)) {
        // Drop legacy plaintext/string sessions or incomplete records lacking binding/expiry
        if (
          val &&
          typeof val === 'object' &&
          typeof (val as SessionRecord).userId === 'string' &&
          typeof (val as SessionRecord).expiresAt === 'number' &&
          typeof (val as SessionRecord).lastActivityAt === 'number' &&
          typeof (val as SessionRecord).ipPrefix === 'string' &&
          typeof (val as SessionRecord).uaHash === 'string'
        ) {
          cleanSessions[key] = val as SessionRecord;
        } else {
          mutated = true;
        }
      }
    }
    parsed.sessions = cleanSessions;
    if (mutated) {
      saveAuthStore(parsed);
    }
    return parsed;
  } catch {
    const seed = createSeedAuthStore();
    saveAuthStore(seed);
    return seed;
  }
}

function writeFileAtomic(targetPath: string, content: string): void {
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, targetPath);
  try {
    fs.chmodSync(targetPath, 0o600);
  } catch {
    // ignore on filesystems without POSIX chmod
  }
}

function saveAuthStore(store: AuthStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const toPersist: AuthStore =
    !store.csrfSecret && cachedRuntimeCsrfSecret
      ? { ...store, csrfSecret: cachedRuntimeCsrfSecret }
      : store;
  writeFileAtomic(AUTH_FILE, JSON.stringify(toPersist, null, 2));
}

function isAdminSetupRequired(store: AuthStore): boolean {
  if (getConfiguredEnvSecret('SEED_ADMIN_PASSWORD')) {
    return false;
  }
  return !Boolean(store.adminClaimed);
}

function syncSeedCredentialsFromEnv(): void {
  const adminPw = getConfiguredEnvSecret('SEED_ADMIN_PASSWORD');
  const casterPw = getConfiguredEnvSecret('SEED_CASTER_PASSWORD');
  const teamPw = getConfiguredEnvSecret('SEED_TEAM_PASSWORD');
  const leagueOpsPw = getConfiguredEnvSecret('SEED_LEAGUE_OPS_PASSWORD');
  const leagueOpsEmail = getConfiguredSeedEmail('SEED_LEAGUE_OPS_EMAIL', 'leagueops@ordal.gg');
  if (!adminPw && !casterPw && !teamPw && !leagueOpsPw) return;

  const store = loadAuthStore();
  let changed = false;
  if (adminPw && !store.adminClaimed) {
    store.adminClaimed = true;
    changed = true;
  }
  let hasSeedLeagueOps = false;
  for (const u of store.users) {
    if (adminPw && u.role === 'SUPER_ADMIN' && !verifyPassword(adminPw, u.passwordHash).valid) {
      u.passwordHash = hashPassword(adminPw);
      changed = true;
    } else if (casterPw && u.role === 'CASTER' && !verifyPassword(casterPw, u.passwordHash).valid) {
      u.passwordHash = hashPassword(casterPw);
      changed = true;
    } else if (teamPw && u.id === 'usr-team-01' && !verifyPassword(teamPw, u.passwordHash).valid) {
      u.passwordHash = hashPassword(teamPw);
      changed = true;
    } else if (u.id === 'usr-leagueops-01' || (u.role === 'LEAGUE_OPS' && u.email.toLowerCase() === leagueOpsEmail)) {
      hasSeedLeagueOps = true;
      if (leagueOpsPw && !verifyPassword(leagueOpsPw, u.passwordHash).valid) {
        u.passwordHash = hashPassword(leagueOpsPw);
        changed = true;
      }
    }
  }
  if (leagueOpsPw && !hasSeedLeagueOps && !store.users.some((u) => u.email.toLowerCase() === leagueOpsEmail)) {
    store.users.push({
      id: 'usr-leagueops-01',
      email: leagueOpsEmail,
      displayName: 'League Ops Turnamen',
      role: 'LEAGUE_OPS',
      passwordHash: hashPassword(leagueOpsPw),
    });
    changed = true;
  }
  if (changed) {
    saveAuthStore(store);
  }
}

function toPublicUser(u: StoredUser): AuthUser {
  const {
    passwordHash: _ignoredPw,
    totpSecret: _ignoredSecret,
    totpPendingSecret: _ignoredPending,
    totpLastUsedStep: _ignoredStep,
    totpRecoveryHashes: _ignoredRecovery,
    ...pub
  } = u;
  return {
    ...pub,
    totpEnabled: Boolean(u.totpEnabled && u.totpSecret),
    recoveryCodesRemaining: Array.isArray(u.totpRecoveryHashes) ? u.totpRecoveryHashes.length : 0,
  };
}

function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function computeUaHash(req: express.Request): string {
  const ua = String(req.headers['user-agent'] || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(ua).digest('hex').slice(0, 32);
}

function computeIpPrefix(ip: string): string {
  const clean = String(ip || '').trim().replace(/^::ffff:/, '');
  if (!clean || isLoopbackIp(clean)) return 'loopback';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) {
    return clean.split('.').slice(0, 3).join('.');
  }
  if (clean.includes(':')) {
    return clean.split(':').slice(0, 3).join(':');
  }
  return clean;
}

function getServerCsrfSecret(): string {
  if (cachedRuntimeCsrfSecret) return cachedRuntimeCsrfSecret;
  const store = loadAuthStore();
  if (store.csrfSecret && store.csrfSecret.length >= 32) {
    cachedRuntimeCsrfSecret = store.csrfSecret;
    return cachedRuntimeCsrfSecret;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  store.csrfSecret = generated;
  saveAuthStore(store);
  cachedRuntimeCsrfSecret = generated;
  return generated;
}

function deriveCsrfToken(tokenHash: string): string {
  return crypto.createHmac('sha256', getServerCsrfSecret()).update(tokenHash).digest('hex');
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function parseCookies(req: express.Request): Record<string, string> {
  const raw = req.headers.cookie;
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (name) {
      try {
        result[name] = decodeURIComponent(val);
      } catch {
        result[name] = val;
      }
    }
  }
  return result;
}

function isLocalHostHeader(hostHeader: string): boolean {
  const hostname = hostHeader.split(':')[0].trim().toLowerCase();
  return !hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isHttpsRequest(req: express.Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (req.secure || proto === 'https') return true;
  // Nginx proxy in preview environments terminates local HTTP:8080 behind external HTTPS, so inspect Origin/Referer/X-Forwarded-Host
  const origin = String(req.headers.origin || '').trim().toLowerCase();
  if (origin.startsWith('https://')) return true;
  const referer = String(req.headers.referer || '').trim().toLowerCase();
  if (referer.startsWith('https://')) return true;
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (forwardedHost && !isLocalHostHeader(forwardedHost)) return true;
  return false;
}

function buildCookieString(
  name: string,
  value: string,
  opts: { httpOnly: boolean; secure: boolean; maxAgeSeconds?: number }
): string {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/'];
  if (opts.httpOnly) attrs.push('HttpOnly');
  if (opts.secure) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  if (typeof opts.maxAgeSeconds === 'number') {
    attrs.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`);
  }
  return attrs.join('; ');
}

function setAuthCookies(
  req: express.Request,
  res: express.Response,
  rawToken: string,
  csrfToken: string,
  role: UserRole
): void {
  const secure = isHttpsRequest(req);
  // SUPER_ADMIN & LEAGUE_OPS receive non-persistent browser session cookies (cleared on browser close)
  const isPrivilegedRole = role === 'SUPER_ADMIN' || role === 'LEAGUE_OPS';
  const maxAgeSeconds = isPrivilegedRole ? undefined : SESSION_TTL_HOURS * 3600;
  res.setHeader('Set-Cookie', [
    buildCookieString(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure,
      maxAgeSeconds,
    }),
    buildCookieString(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure,
      maxAgeSeconds,
    }),
  ]);
}

function clearAuthCookies(req: express.Request, res: express.Response): void {
  const secure = isHttpsRequest(req);
  res.setHeader('Set-Cookie', [
    buildCookieString(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure,
      maxAgeSeconds: 0,
    }),
    buildCookieString(CSRF_COOKIE_NAME, '', {
      httpOnly: false,
      secure,
      maxAgeSeconds: 0,
    }),
  ]);
}

interface AuthContext {
  user: StoredUser;
  tokenHash: string;
  session: SessionRecord;
  source: 'cookie' | 'bearer';
}

function extractRawSession(req: express.Request): {
  rawToken: string;
  source: 'cookie' | 'bearer' | null;
} {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim();
    if (bearer) return { rawToken: bearer, source: 'bearer' };
  }
  const cookies = parseCookies(req);
  const cookieToken = String(cookies[SESSION_COOKIE_NAME] || '').trim();
  if (cookieToken) {
    return { rawToken: cookieToken, source: 'cookie' };
  }
  return { rawToken: '', source: null };
}

function pruneSessions(store: AuthStore, now: number): boolean {
  let changed = false;
  for (const [tokHash, sess] of Object.entries(store.sessions)) {
    if (
      now > sess.expiresAt ||
      now - sess.lastActivityAt > INACTIVITY_TIMEOUT_MS
    ) {
      delete store.sessions[tokHash];
      changed = true;
    }
  }
  for (const [oldHash, meta] of recentlyRotatedTokens.entries()) {
    if (now - meta.invalidatedAt > ROTATED_REPLAY_WINDOW_MS) {
      recentlyRotatedTokens.delete(oldHash);
    }
  }
  return changed;
}

function issueSessionForUser(
  req: express.Request,
  res: express.Response,
  store: AuthStore,
  user: StoredUser
): { rawToken: string; tokenHash: string; csrfToken: string } {
  const now = Date.now();
  pruneSessions(store, now);

  // Enforce single active concurrent session for SUPER_ADMIN & LEAGUE_OPS
  const isPrivilegedRole = user.role === 'SUPER_ADMIN' || user.role === 'LEAGUE_OPS';
  if (isPrivilegedRole) {
    for (const [tokHash, sess] of Object.entries(store.sessions)) {
      if (sess.userId === user.id) {
        delete store.sessions[tokHash];
      }
    }
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = deriveCsrfToken(tokenHash);
  const ttlMs = isPrivilegedRole ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;

  store.sessions[tokenHash] = {
    userId: user.id,
    role: user.role,
    expiresAt: now + ttlMs,
    lastActivityAt: now,
    createdAt: now,
    lastRotatedAt: now,
    ipPrefix: computeIpPrefix(getClientIp(req)),
    uaHash: computeUaHash(req),
  };

  setAuthCookies(req, res, rawToken, csrfToken, user.role);
  return { rawToken, tokenHash, csrfToken };
}

function resolveAuthContext(req: express.Request, res?: express.Response): AuthContext | null {
  const reqAny = req as express.Request & { __ordalAuthResolved?: boolean; __ordalAuthCtx?: AuthContext | null };
  if (reqAny.__ordalAuthResolved) {
    return reqAny.__ordalAuthCtx || null;
  }

  const { rawToken, source } = extractRawSession(req);
  if (!rawToken || !source) {
    reqAny.__ordalAuthResolved = true;
    reqAny.__ordalAuthCtx = null;
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  const reqIp = getClientIp(req);
  const reqIpPrefix = computeIpPrefix(reqIp);
  const reqUaHash = computeUaHash(req);

  // Detect replay of an already-rotated session token
  const rotatedEntry = recentlyRotatedTokens.get(tokenHash);
  if (rotatedEntry) {
    const withinGrace =
      now - rotatedEntry.invalidatedAt <= ROTATED_GRACE_WINDOW_MS &&
      rotatedEntry.ipPrefix === reqIpPrefix &&
      rotatedEntry.uaHash === reqUaHash;

    if (!withinGrace) {
      const store = loadAuthStore();
      let revoked = 0;
      for (const [tok, sess] of Object.entries(store.sessions)) {
        if (sess.userId === rotatedEntry.userId) {
          delete store.sessions[tok];
          revoked += 1;
        }
      }
      if (revoked > 0) saveAuthStore(store);
      const affectedUser = store.users.find((u) => u.id === rotatedEntry.userId);
      recordSocEvent({
        severity: 'CRITICAL',
        category: 'SESSION_HIJACK',
        ip: reqIp,
        method: req.method,
        path: req.path,
        actorEmail: affectedUser?.email,
        actorRole: affectedUser?.role,
        userAgent: String(req.headers['user-agent'] || ''),
        summary: `Deteksi Replay Attack pada token sesi yang sudah dirotasi (${affectedUser?.email || rotatedEntry.userId}).`,
        details: `Seluruh sesi akun dicabut otomatis (${revoked} sesi).`,
      });
    }
    if (res && source === 'cookie') clearAuthCookies(req, res);
    reqAny.__ordalAuthResolved = true;
    reqAny.__ordalAuthCtx = null;
    return null;
  }

  const store = loadAuthStore();
  const rawSession = store.sessions[tokenHash];
  if (!rawSession) {
    if (res && source === 'cookie') clearAuthCookies(req, res);
    reqAny.__ordalAuthResolved = true;
    reqAny.__ordalAuthCtx = null;
    return null;
  }

  // Enforce session binding (IP subnet + User-Agent hash)
  if (rawSession.uaHash !== reqUaHash || rawSession.ipPrefix !== reqIpPrefix) {
    const affectedUser = store.users.find((u) => u.id === rawSession.userId);
    delete store.sessions[tokenHash];
    saveAuthStore(store);
    recordSocEvent({
      severity: 'CRITICAL',
      category: 'SESSION_HIJACK',
      ip: reqIp,
      method: req.method,
      path: req.path,
      actorEmail: affectedUser?.email,
      actorRole: affectedUser?.role,
      userAgent: String(req.headers['user-agent'] || ''),
      summary: `Indikasi Session Hijacking terdeteksi pada ${affectedUser?.email || rawSession.userId}: fingerprint perangkat/IP berubah.`,
      details: `Expected IP prefix ${rawSession.ipPrefix}, got ${reqIpPrefix}. Sesi dicabut otomatis.`,
    });
    if (res && source === 'cookie') clearAuthCookies(req, res);
    reqAny.__ordalAuthResolved = true;
    reqAny.__ordalAuthCtx = null;
    return null;
  }

  const isAbsoluteExpired = now > rawSession.expiresAt;
  const isIdleExpired = now - rawSession.lastActivityAt > INACTIVITY_TIMEOUT_MS;
  if (isAbsoluteExpired || isIdleExpired) {
    delete store.sessions[tokenHash];
    saveAuthStore(store);
    if (res && source === 'cookie') clearAuthCookies(req, res);
    reqAny.__ordalAuthResolved = true;
    reqAny.__ordalAuthCtx = null;
    return null;
  }

  if (req.method !== 'GET' && now - rawSession.lastActivityAt > 30_000) {
    rawSession.lastActivityAt = now;
    saveAuthStore(store);
  }

  const user = store.users.find((u) => u.id === rawSession.userId) || null;
  if (!user) {
    delete store.sessions[tokenHash];
    saveAuthStore(store);
    reqAny.__ordalAuthResolved = true;
    reqAny.__ordalAuthCtx = null;
    return null;
  }

  const ctx: AuthContext = { user, tokenHash, session: rawSession, source };
  reqAny.__ordalAuthResolved = true;
  reqAny.__ordalAuthCtx = ctx;
  return ctx;
}

function getAuthenticatedUser(req: express.Request): StoredUser | null {
  return resolveAuthContext(req)?.user || null;
}

function requireRoles(...roles: UserRole[]): express.RequestHandler {
  return (req, res, next) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    }
    if (!roles.includes(user.role)) {
      const socStore = loadSocStore();
      if (socStore.policy.alertOnRbacViolation) {
        recordSocEvent({
          severity: roles.includes('SUPER_ADMIN') ? 'HIGH' : 'MEDIUM',
          category: 'RBAC_VIOLATION',
          ip: getClientIp(req),
          method: req.method,
          path: req.path,
          actorEmail: user.email,
          actorRole: user.role,
          userAgent: String(req.headers['user-agent'] || ''),
          summary: `Percobaan akses tidak sah oleh ${user.role} (${user.email}) ke ${req.method} ${req.path}.`,
          details: `Role dibutuhkan: ${roles.join(', ')}`,
        });
      }
      return res.status(403).json({ error: 'Akses ditolak untuk role Anda.' });
    }
    next();
  };
}

function createSeedDatabase(): OrdalDatabase {
  const now = new Date().toISOString();
  return {
    tournaments: [
      {
        id: 'trn-001',
        name: 'ORDAL POINT BLANK NIGHTFALL SERIES #04',
        game: 'POINT BLANK',
        format: 'SINGLE ELIMINATION',
        prizePool: 'Rp 25.000.000',
        maxTeams: 8,
        registeredTeams: 8,
        startDate: '2026-11-20 19:00 WIB',
        region: 'ID / SEA',
        status: 'ONGOING',
        description:
          'Turnamen kilat 8 squad khusus semi-pro & komunitas kompetitif Point Blank (Bomb Mission 5v5) dengan otomasi seeding bracket dan verifikasi skor real-time.',
        liveStreamUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      },
      {
        id: 'trn-002',
        name: 'ORDAL FREE FIRE BOOYAH CLASH S2',
        game: 'FREE FIRE',
        format: 'DOUBLE ELIMINATION',
        prizePool: 'Rp 40.000.000',
        maxTeams: 16,
        registeredTeams: 12,
        startDate: '2026-11-24 20:00 WIB',
        region: 'ID / SEA',
        status: 'OPEN',
        description:
          'Kompetisi Free Fire Clash Squad & Battle Royale dengan format Double Elimination BO3 dan sistem check-in roster instan 30 menit sebelum kick-off.',
      },
      {
        id: 'trn-003',
        name: 'ORDAL EFOOTBALL CHAMPIONS CUP',
        game: 'EFOOTBALL',
        format: 'SINGLE ELIMINATION',
        prizePool: 'Rp 15.000.000',
        maxTeams: 16,
        registeredTeams: 16,
        startDate: '2026-11-12 18:30 WIB',
        region: 'ID',
        status: 'COMPLETED',
        description:
          'Turnamen eFootball kompetitif (1v1 & Co-Op) dengan format knockout cepat, jadwal terstruktur, dan replay pertandingan lengkap.',
        replayStreamUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      },
    ],
    matches: [
      {
        id: 'mch-qf1',
        tournamentId: 'trn-001',
        game: 'POINT BLANK',
        round: 'QUARTERFINAL',
        bracketOrder: 1,
        teamA: 'ORDAL VANGUARD',
        teamATag: 'ORD',
        teamB: 'FALCON STRIKE',
        teamBTag: 'FLCN',
        scoreA: 10,
        scoreB: 6,
        mapName: 'DOWNTOWN',
        status: 'FINISHED',
        winnerTag: 'ORD',
        nextMatchId: 'mch-sf1',
        nextMatchSlot: 'A',
        mvpIgn: 'ORD_Kuroi#ID1',
        updatedAt: now,
      },
      {
        id: 'mch-qf2',
        tournamentId: 'trn-001',
        game: 'POINT BLANK',
        round: 'QUARTERFINAL',
        bracketOrder: 2,
        teamA: 'KRAKEN SYNDICATE',
        teamATag: 'KRKN',
        teamB: 'NOVA PROTOCOL',
        teamBTag: 'NOVA',
        scoreA: 8,
        scoreB: 10,
        mapName: 'LUXVILLE',
        status: 'FINISHED',
        winnerTag: 'NOVA',
        nextMatchId: 'mch-sf1',
        nextMatchSlot: 'B',
        mvpIgn: 'NV_Raze#SEA',
        updatedAt: now,
      },
      {
        id: 'mch-qf3',
        tournamentId: 'trn-001',
        game: 'POINT BLANK',
        round: 'QUARTERFINAL',
        bracketOrder: 3,
        teamA: 'PHANTOM FIVE',
        teamATag: 'PH5',
        teamB: 'GARUDA STRIKE',
        teamBTag: 'GRDA',
        scoreA: 10,
        scoreB: 5,
        mapName: 'BLOWCITY',
        status: 'FINISHED',
        winnerTag: 'PH5',
        nextMatchId: 'mch-sf2',
        nextMatchSlot: 'A',
        mvpIgn: 'PH5_Vex#007',
        updatedAt: now,
      },
      {
        id: 'mch-qf4',
        tournamentId: 'trn-001',
        game: 'POINT BLANK',
        round: 'QUARTERFINAL',
        bracketOrder: 4,
        teamA: 'ZERO VECTOR',
        teamATag: 'ZVEC',
        teamB: 'OBSIDIAN REIGN',
        teamBTag: 'OBSD',
        scoreA: 9,
        scoreB: 10,
        mapName: 'STORM TUBE',
        status: 'FINISHED',
        winnerTag: 'OBSD',
        nextMatchId: 'mch-sf2',
        nextMatchSlot: 'B',
        mvpIgn: 'OBSD_Sora#99',
        updatedAt: now,
      },
      {
        id: 'mch-sf1',
        tournamentId: 'trn-001',
        game: 'POINT BLANK',
        round: 'SEMIFINAL',
        bracketOrder: 1,
        teamA: 'ORDAL VANGUARD',
        teamATag: 'ORD',
        teamB: 'NOVA PROTOCOL',
        teamBTag: 'NOVA',
        scoreA: 9,
        scoreB: 7,
        mapName: 'SAFEHOUSE',
        status: 'LIVE',
        nextMatchId: 'mch-gf1',
        nextMatchSlot: 'A',
        mvpIgn: 'ORD_Kuroi#ID1',
        updatedAt: now,
      },
      {
        id: 'mch-sf2',
        tournamentId: 'trn-001',
        game: 'POINT BLANK',
        round: 'SEMIFINAL',
        bracketOrder: 2,
        teamA: 'PHANTOM FIVE',
        teamATag: 'PH5',
        teamB: 'OBSIDIAN REIGN',
        teamBTag: 'OBSD',
        scoreA: 10,
        scoreB: 8,
        mapName: 'SANDSTORM',
        status: 'FINISHED',
        winnerTag: 'PH5',
        nextMatchId: 'mch-gf1',
        nextMatchSlot: 'B',
        mvpIgn: 'PH5_Vex#007',
        updatedAt: now,
      },
      {
        id: 'mch-gf1',
        tournamentId: 'trn-001',
        game: 'POINT BLANK',
        round: 'GRAND FINAL',
        bracketOrder: 1,
        teamA: 'TBD',
        teamATag: 'TBD',
        teamB: 'PHANTOM FIVE',
        teamBTag: 'PH5',
        scoreA: 0,
        scoreB: 0,
        mapName: 'DOWNTOWN / BO3',
        status: 'UPCOMING',
        updatedAt: now,
      },
      {
        id: 'mch-ff1',
        tournamentId: 'trn-002',
        game: 'FREE FIRE',
        round: 'QUARTERFINAL',
        bracketOrder: 1,
        teamA: 'JAKARTA BREACH',
        teamATag: 'JKT',
        teamB: 'CYBER WOLVES',
        teamBTag: 'CWLV',
        scoreA: 4,
        scoreB: 2,
        mapName: 'BERMUDA',
        status: 'LIVE',
        mvpIgn: 'JKT_Bima',
        updatedAt: now,
      },
    ],
    squads: [
      {
        id: 'sqd-001',
        name: 'ORDAL VANGUARD',
        tag: 'ORD',
        tournamentId: 'trn-001',
        captainIgn: 'ORD_Kuroi#ID1',
        captainContact: 'discord: kuroi.ord',
        roster: ['ORD_Kuroi#ID1', 'ORD_Fikri#29', 'ORD_Zane#88', 'ORD_Ryu#12', 'ORD_Mika#04'],
        seed: 1,
        checkInStatus: 'CHECKED IN',
        registeredAt: '2026-11-15 14:20 WIB',
      },
      {
        id: 'sqd-002',
        name: 'NOVA PROTOCOL',
        tag: 'NOVA',
        tournamentId: 'trn-001',
        captainIgn: 'NV_Raze#SEA',
        captainContact: 'discord: raze.nv',
        roster: ['NV_Raze#SEA', 'NV_Kael#01', 'NV_Dex#55', 'NV_Yuki#22', 'NV_Alv#09'],
        seed: 2,
        checkInStatus: 'CHECKED IN',
        registeredAt: '2026-11-15 15:05 WIB',
      },
      {
        id: 'sqd-003',
        name: 'PHANTOM FIVE',
        tag: 'PH5',
        tournamentId: 'trn-001',
        captainIgn: 'PH5_Vex#007',
        captainContact: 'discord: vex.ph5',
        roster: ['PH5_Vex#007', 'PH5_Nox#14', 'PH5_Jett#31', 'PH5_Lynx#08', 'PH5_Dax#77'],
        seed: 3,
        checkInStatus: 'CHECKED IN',
        registeredAt: '2026-11-15 16:40 WIB',
      },
      {
        id: 'sqd-004',
        name: 'OBSIDIAN REIGN',
        tag: 'OBSD',
        tournamentId: 'trn-001',
        captainIgn: 'OBSD_Sora#99',
        captainContact: 'discord: sora.obsd',
        roster: ['OBSD_Sora#99', 'OBSD_Kiro#10', 'OBSD_Trix#44', 'OBSD_Ren#61', 'OBSD_Vyn#02'],
        seed: 4,
        checkInStatus: 'CHECKED IN',
        registeredAt: '2026-11-16 09:10 WIB',
      },
      {
        id: 'sqd-005',
        name: 'FALCON STRIKE',
        tag: 'FLCN',
        tournamentId: 'trn-001',
        captainIgn: 'FLCN_Ardi#ID',
        captainContact: 'discord: ardi.flcn',
        roster: ['FLCN_Ardi#ID', 'FLCN_Neo#18', 'FLCN_Haze#27', 'FLCN_Bara#90', 'FLCN_Seno#11'],
        seed: 5,
        checkInStatus: 'CHECKED IN',
        registeredAt: '2026-11-16 11:30 WIB',
      },
      {
        id: 'sqd-006',
        name: 'JAKARTA BREACH',
        tag: 'JKT',
        tournamentId: 'trn-002',
        captainIgn: 'JKT_Bima',
        captainContact: 'discord: bima.jkt',
        roster: ['JKT_Bima', 'JKT_Reza', 'JKT_Dito', 'JKT_Fajar', 'JKT_Nanda'],
        seed: 1,
        checkInStatus: 'PENDING',
        registeredAt: '2026-11-17 10:15 WIB',
      },
    ],
    news: [
      {
        id: 'nws-001',
        title: 'META RUSHER AUG A3 & SMOKE EXECUTE MENDOMINASI POINT BLANK SERIES #04',
        category: 'META UPDATE',
        author: 'Raka Pratama',
        publishedAt: '17 Nov 2026',
        readTime: '4 MIN READ',
        excerpt:
          'Analisis taktis mengapa 75% tim semifinalis Point Blank beralih ke komposisi double rusher di Downtown dan Luxville untuk mengunci tempo retake.',
        content:
          'Komposisi Double Rusher dengan eksekusi smoke cepat kembali menjadi standar emas di panggung kompetitif ORDAL Point Blank Nightfall Series #04. Data pertandingan dari 14 map yang dimainkan menunjukkan rasio kemenangan sisi CT meningkat 18,4% saat tim disiplin menjaga rotasi Mid di Downtown.\n\nORDAL Vanguard menunjukkan eksekusi paling disiplin saat menghadapi Falcon Strike di Downtown. Alih-alih memaksakan duel aim mentah di awal ronde, mereka memperlambat tempo hingga detik ke-25 sebelum melancarkan split cepat ke Site B.\n\nBagi tim komunitas dan semi-pro yang bersiap menghadapi fase kualifikasi berikutnya, penguasaan timing granat dan disiplin post-plant kini jauh lebih menentukan dibanding sekadar statistik kill individu.',
        accentTone: 'lime',
      },
      {
        id: 'nws-002',
        title: 'ROSTER LEAKS: KAPTEN PHANTOM FIVE DIKABARKAN UJI COBA LINEUP FREE FIRE BARU',
        category: 'ROSTER LEAKS',
        author: 'Nadia Kusuma',
        publishedAt: '16 Nov 2026',
        readTime: '3 MIN READ',
        excerpt:
          'Sumber internal komunitas menyebut Phantom Five tengah menyiapkan dua rusher muda dari sirkuit Free Fire regional untuk musim depan.',
        content:
          'Menjelang Grand Final ORDAL Series #04, rumor perombakan roster berhembus kencang di kubu Phantom Five. Manajemen tim disebut sedang menguji dua talenta agresif dari skena Free Fire Clash Squad regional.\n\nLangkah ini dinilai sebagai upaya memperkuat konsistensi rotasi zona akhir di Bermuda dan Purgatory. Belum ada pernyataan resmi dari kapten PH5_Vex#007, namun sesi scrim tertutup mereka pekan ini sudah memancing spekulasi luas di komunitas.',
        accentTone: 'crimson',
      },
      {
        id: 'nws-003',
        title: 'REKAP CHAMPIONS CUP: FORMASI 4-2-1-3 QUICK COUNTER DOMINASI EFOOTBALL',
        category: 'TOURNAMENT RECAP',
        author: 'Dimas Aditya',
        publishedAt: '15 Nov 2026',
        readTime: '5 MIN READ',
        excerpt:
          'Tertinggal 0-2 di babak pertama, NOVA Protocol membalikkan keadaan menjadi 3-2 lewat transisi Quick Counter yang mematikan.',
        content:
          'Pertarungan Kraken Syndicate melawan NOVA Protocol di ORDAL eFootball Champions Cup menjadi salah satu laga paling intens pekan ini. Kraken memulai dengan dominan lewat penguasaan bola Possession Game.\n\nNamun penyesuaian cepat dari pemain NOVA di babak kedua mengubah arah pertandingan sepenuhnya. Dengan mengandalkan formasi 4-2-1-3 Quick Counter dan pressing tinggi di menit ke-70, NOVA mengunci kemenangan dramatis 3-2.',
        accentTone: 'cyan',
      },
    ],
    casters: [
      {
        id: 'cst-001',
        name: 'Yosafat Putra Asa',
        alias: 'YOSAFAT',
        specialtyGames: ['POINT BLANK', 'FREE FIRE', 'EFOOTBALL'],
        rateCard: 150000,
        maxMatchesPerDay: 2,
        dayOffDates: ['2026-11-23'],
        bio: 'Lead Shoutcaster ORDAL Entertainment dengan spesialisasi Point Blank & analisis taktis tempo tinggi.',
        status: 'ACTIVE',
        isVerified: true,
        isTopCaster: true,
      },
      {
        id: 'cst-002',
        name: 'Aldin "Rymot" Endaryan',
        alias: 'RYMOT',
        specialtyGames: ['FREE FIRE', 'EFOOTBALL', 'POINT BLANK'],
        rateCard: 125000,
        maxMatchesPerDay: 2,
        dayOffDates: ['2026-11-24'],
        bio: 'Play-by-play shoutcaster spesialis Free Fire & eFootball untuk skena kompetitif regional.',
        status: 'ACTIVE',
        isVerified: true,
        isTopCaster: false,
      },
      {
        id: 'cst-003',
        name: 'Raka "Vortex" Pratama',
        alias: 'VORTEX',
        specialtyGames: ['POINT BLANK', 'EFOOTBALL', 'FREE FIRE'],
        rateCard: 100000,
        maxMatchesPerDay: 2,
        dayOffDates: [],
        bio: 'Color caster & analis meta kompetitif in-house ORDAL Entertainment.',
        status: 'ACTIVE',
        isVerified: false,
        isTopCaster: false,
      },
    ],
    scrims: [
      {
        id: 'scr-001',
        game: 'POINT BLANK',
        date: '2026-11-20',
        timeSlot: '20:00 WIB',
        mode: 'OPEN_LOBBY',
        status: 'OPEN_LOBBY',
        casterId: 'cst-001',
        casterName: 'Yosafat Putra Asa',
        casterRate: 150000,
        casterApprovalStatus: 'APPROVED',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 200000,
        splitCostPerTeam: 100000,
        hostTeamName: 'ORDAL VANGUARD',
        hostTeamLogo: '',
        hostRosterCore: ['ORD_Kuroi#01', 'ORD_Fikri#29', 'ORD_Zane#88', 'ORD_Ryu#12', 'ORD_Mika#04'],
        hostRosterSub: ['ORD_Seno#99'],
        challengerTeamName: '',
        challengerTeamLogo: '',
        challengerRosterCore: [],
        challengerRosterSub: [],
        hostPaid: false,
        challengerPaid: false,
        createdAt: '17 Nov 2026, 15:00 WIB',
      },
      {
        id: 'scr-005',
        game: 'POINT BLANK',
        date: '2026-11-20',
        timeSlot: '22:00 WIB',
        mode: 'DIRECT_CHALLENGE',
        status: 'CONFIRMED',
        casterId: 'cst-001',
        casterName: 'Yosafat Putra Asa',
        casterRate: 150000,
        casterApprovalStatus: 'APPROVED',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 200000,
        splitCostPerTeam: 100000,
        hostTeamName: 'ZERO VECTOR',
        hostTeamLogo: '',
        hostRosterCore: ['ZV_Arka', 'ZV_Bimo', 'ZV_Candra', 'ZV_Diaz', 'ZV_Edo'],
        hostRosterSub: [],
        challengerTeamName: 'KRAKEN SYNDICATE',
        challengerTeamLogo: '',
        challengerRosterCore: ['KR_Fino', 'KR_Gilang', 'KR_Hendra', 'KR_Irfan', 'KR_Joko'],
        challengerRosterSub: [],
        hostPaid: true,
        challengerPaid: true,
        hostScore: 10,
        challengerScore: 7,
        winnerSide: 'host',
        resultRecorded: true,
        createdAt: '17 Nov 2026, 14:40 WIB',
      },
      {
        id: 'scr-002',
        game: 'FREE FIRE',
        date: '2026-11-20',
        timeSlot: '22:00 WIB',
        mode: 'OPEN_LOBBY',
        status: 'WAITING_APPROVAL',
        casterId: 'cst-002',
        casterName: 'Aldin "Rymot" Endaryan',
        casterRate: 125000,
        casterApprovalStatus: 'PENDING',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 175000,
        splitCostPerTeam: 87500,
        hostTeamName: 'NOVA PROTOCOL',
        hostTeamLogo: '',
        hostRosterCore: ['NV_Raze (ID:8821)', 'NV_Kael (ID:9912)', 'NV_Dex (ID:1104)', 'NV_Yuki (ID:4410)'],
        hostRosterSub: ['NV_Lio (ID:3301)'],
        challengerTeamName: 'PHANTOM FIVE',
        challengerTeamLogo: '',
        challengerRosterCore: ['PH5_Vex (ID:5521)', 'PH5_Nox (ID:7742)', 'PH5_Jett (ID:2190)', 'PH5_Lynx (ID:6120)'],
        challengerRosterSub: ['PH5_Rex (ID:9081)'],
        hostPaid: false,
        challengerPaid: false,
        createdAt: '17 Nov 2026, 15:20 WIB',
      },
      {
        id: 'scr-003',
        game: 'EFOOTBALL',
        date: '2026-11-21',
        timeSlot: '20:00 WIB',
        mode: 'DIRECT_CHALLENGE',
        status: 'PARTIALLY_PAID',
        casterId: 'cst-001',
        casterName: 'Yosafat Putra Asa',
        casterRate: 150000,
        casterApprovalStatus: 'PENDING',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 200000,
        splitCostPerTeam: 100000,
        hostTeamName: 'JAKARTA BREACH',
        hostTeamLogo: '',
        hostRosterCore: ['JKT_Bima', 'JKT_Reza', 'JKT_Dito'],
        hostRosterSub: ['JKT_Tama'],
        challengerTeamName: 'CYBER WOLVES',
        challengerTeamLogo: '',
        challengerRosterCore: ['CW_Riko', 'CW_Hadi', 'CW_Bram'],
        challengerRosterSub: [],
        hostPaid: true,
        challengerPaid: false,
        paymentDeadlineAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
        createdAt: '17 Nov 2026, 15:30 WIB',
      },
      {
        id: 'scr-004',
        game: 'FREE FIRE',
        date: '2026-11-22',
        timeSlot: '20:00 WIB',
        mode: 'DIRECT_CHALLENGE',
        status: 'CONFIRMED',
        casterId: 'cst-002',
        casterName: 'Aldin "Rymot" Endaryan',
        casterRate: 125000,
        casterApprovalStatus: 'APPROVED',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 175000,
        splitCostPerTeam: 87500,
        hostTeamName: 'OBSIDIAN REIGN',
        hostTeamLogo: '',
        hostRosterCore: ['OBSD_Sora', 'OBSD_Kiro', 'OBSD_Trix', 'OBSD_Ren'],
        hostRosterSub: ['OBSD_Vyn'],
        challengerTeamName: 'FALCON STRIKE',
        challengerTeamLogo: '',
        challengerRosterCore: ['FLCN_Ardi', 'FLCN_Neo', 'FLCN_Haze', 'FLCN_Bara'],
        challengerRosterSub: ['FLCN_Seno'],
        hostPaid: true,
        challengerPaid: true,
        hostScore: 4,
        challengerScore: 2,
        winnerSide: 'host',
        resultRecorded: true,
        createdAt: '17 Nov 2026, 14:15 WIB',
      },
      {
        id: 'scr-006',
        game: 'POINT BLANK',
        date: '2026-11-16',
        timeSlot: '20:00 WIB',
        mode: 'DIRECT_CHALLENGE',
        status: 'CONFIRMED',
        casterId: 'cst-001',
        casterName: 'Yosafat Putra Asa',
        casterRate: 150000,
        casterApprovalStatus: 'APPROVED',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 200000,
        splitCostPerTeam: 100000,
        hostTeamName: 'ORDAL VANGUARD',
        hostTeamLogo: '',
        hostRosterCore: ['ORD_Kuro#01', 'ORD_Rex#02', 'ORD_Vyn#03', 'ORD_Zed#04', 'ORD_Lynx#05'],
        hostRosterSub: [],
        challengerTeamName: 'VALKYRIE ZERO',
        challengerTeamLogo: '',
        challengerRosterCore: ['VKZ_Aris', 'VKZ_Budi', 'VKZ_Cakra', 'VKZ_Deni', 'VKZ_Eka'],
        challengerRosterSub: [],
        hostPaid: true,
        challengerPaid: true,
        hostScore: 10,
        challengerScore: 8,
        winnerSide: 'host',
        resultRecorded: true,
        createdAt: '16 Nov 2026, 19:10 WIB',
      },
      {
        id: 'scr-007',
        game: 'EFOOTBALL',
        date: '2026-11-17',
        timeSlot: '20:00 WIB',
        mode: 'DIRECT_CHALLENGE',
        status: 'CONFIRMED',
        casterId: 'cst-002',
        casterName: 'Aldin "Rymot" Endaryan',
        casterRate: 125000,
        casterApprovalStatus: 'APPROVED',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 175000,
        splitCostPerTeam: 87500,
        hostTeamName: 'ORDAL VANGUARD',
        hostTeamLogo: '',
        hostRosterCore: ['ORD_Kuro#01', 'ORD_Rex#02', 'ORD_Vyn#03'],
        hostRosterSub: [],
        challengerTeamName: 'NOVA PROTOCOL',
        challengerTeamLogo: '',
        challengerRosterCore: ['NV_Raze', 'NV_Kael', 'NV_Dex'],
        challengerRosterSub: [],
        hostPaid: true,
        challengerPaid: true,
        hostScore: 3,
        challengerScore: 1,
        winnerSide: 'host',
        resultRecorded: true,
        createdAt: '17 Nov 2026, 18:00 WIB',
      },
      {
        id: 'scr-008',
        game: 'EFOOTBALL',
        date: '2026-11-18',
        timeSlot: '22:00 WIB',
        mode: 'DIRECT_CHALLENGE',
        status: 'CONFIRMED',
        casterId: 'cst-003',
        casterName: 'Raka "Vortex" Pratama',
        casterRate: 100000,
        casterApprovalStatus: 'APPROVED',
        platformFee: PLATFORM_LOBBY_FEE,
        totalCost: 150000,
        splitCostPerTeam: 75000,
        hostTeamName: 'JAKARTA BREACH',
        hostTeamLogo: '',
        hostRosterCore: ['JKT_Bima', 'JKT_Reza', 'JKT_Dito'],
        hostRosterSub: [],
        challengerTeamName: 'OBSIDIAN REIGN',
        challengerTeamLogo: '',
        challengerRosterCore: ['OBSD_Sora', 'OBSD_Kiro', 'OBSD_Trix'],
        challengerRosterSub: [],
        hostPaid: true,
        challengerPaid: true,
        hostScore: 13,
        challengerScore: 11,
        winnerSide: 'host',
        resultRecorded: true,
        createdAt: '18 Nov 2026, 20:10 WIB',
      },
    ],
    withdrawals: [],
    heroSettings: { ...DEFAULT_HERO_SETTINGS },
    brandSettings: { ...DEFAULT_BRAND_SETTINGS },
    auditLogs: [],
  };
}

function loadDb(): OrdalDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedDatabase();
    writeFileAtomic(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<OrdalDatabase>;
    if (!Array.isArray(parsed.casters) || !Array.isArray(parsed.scrims)) {
      const seed = createSeedDatabase();
      const hydrated: OrdalDatabase = {
        tournaments: parsed.tournaments || seed.tournaments,
        matches: parsed.matches || seed.matches,
        squads: parsed.squads || seed.squads,
        news: parsed.news || seed.news,
        scrims: seed.scrims,
        casters: seed.casters,
        withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
        heroSettings: parsed.heroSettings
          ? { ...DEFAULT_HERO_SETTINGS, ...parsed.heroSettings }
          : { ...DEFAULT_HERO_SETTINGS },
        brandSettings: parsed.brandSettings
          ? { ...DEFAULT_BRAND_SETTINGS, ...parsed.brandSettings }
          : { ...DEFAULT_BRAND_SETTINGS },
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      };
      saveDb(hydrated);
      return hydrated;
    }
    if (!Array.isArray(parsed.withdrawals)) {
      parsed.withdrawals = [];
    }
    let mutated = false;
    if (!parsed.heroSettings) {
      parsed.heroSettings = { ...DEFAULT_HERO_SETTINGS };
      mutated = true;
    }
    if (!parsed.brandSettings) {
      parsed.brandSettings = { ...DEFAULT_BRAND_SETTINGS };
      mutated = true;
    }
    if (!parsed.scrimSettings) {
      parsed.scrimSettings = { ...DEFAULT_SCRIM_SETTINGS, lobbyFeeByGame: {} };
      mutated = true;
    }
    if (!Array.isArray(parsed.auditLogs)) {
      parsed.auditLogs = [];
      mutated = true;
    }
    parsed.casters = parsed.casters.map((c) => {
      if (typeof c.isVerified !== 'boolean' || typeof c.isTopCaster !== 'boolean') {
        mutated = true;
        return {
          ...c,
          isVerified:
            typeof c.isVerified === 'boolean'
              ? c.isVerified
              : c.id === 'cst-001' || c.id === 'cst-002',
          isTopCaster:
            typeof c.isTopCaster === 'boolean' ? c.isTopCaster : c.id === 'cst-001',
        };
      }
      return c;
    });
    parsed.scrims = parsed.scrims.map((sc) => {
      if (typeof sc.platformFee !== 'number' || !sc.casterApprovalStatus) {
        mutated = true;
        const matchedCaster = parsed.casters?.find((c) => c.name === sc.casterName);
        const fee =
          typeof sc.platformFee === 'number'
            ? sc.platformFee
            : getEffectiveLobbyFee(parsed, sc.game);
        const totalCost = sc.casterRate + fee;
        return {
          ...sc,
          casterId: sc.casterId || matchedCaster?.id || 'none',
          casterApprovalStatus:
            sc.casterApprovalStatus ||
            (sc.casterRate > 0 ? (sc.status === 'CONFIRMED' ? 'APPROVED' : 'PENDING') : 'NOT_REQUIRED'),
          platformFee: fee,
          totalCost,
          splitCostPerTeam: Math.round(totalCost / 2),
        };
      }
      return sc;
    });
    // Auto-hydrate recorded scrim results for Team Leaderboard Scrim if none exist yet
    if (!parsed.scrims.some((s) => s.resultRecorded)) {
      const seedScrims = createSeedDatabase().scrims;
      const existingIds = new Set(parsed.scrims.map((s) => s.id));
      parsed.scrims = parsed.scrims.map((s) => {
        const seedMatch = seedScrims.find((ss) => ss.id === s.id);
        if (seedMatch && seedMatch.resultRecorded) {
          return {
            ...s,
            hostScore: seedMatch.hostScore,
            challengerScore: seedMatch.challengerScore,
            winnerSide: seedMatch.winnerSide,
            resultRecorded: true,
          };
        }
        return s;
      });
      for (const ss of seedScrims) {
        if (ss.resultRecorded && !existingIds.has(ss.id)) {
          parsed.scrims.push(ss);
        }
      }
      mutated = true;
    }
    if (ensurePaymentRecords(parsed as OrdalDatabase)) {
      mutated = true;
    }
    if (mutated) saveDb(parsed as OrdalDatabase);
    return parsed as OrdalDatabase;
  } catch {
    const seed = createSeedDatabase();
    ensurePaymentRecords(seed);
    writeFileAtomic(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
}

function saveDb(db: OrdalDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileAtomic(DB_FILE, JSON.stringify(db, null, 2));
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

const PAYMENT_GATEWAY_PROVIDER_MODE = (
  getConfiguredEnvSecret('PAYMENT_GATEWAY_PROVIDER') || 'SANDBOX'
).toUpperCase();
const ACTIVE_GATEWAY_PROVIDER: GatewayProvider =
  PAYMENT_GATEWAY_PROVIDER_MODE === 'MIDTRANS' ||
  PAYMENT_GATEWAY_PROVIDER_MODE === 'MIDTRANS_SNAP'
    ? 'MIDTRANS_SNAP'
    : PAYMENT_GATEWAY_PROVIDER_MODE === 'XENDIT' ||
        PAYMENT_GATEWAY_PROVIDER_MODE === 'XENDIT_BI_SNAP'
      ? 'XENDIT_BI_SNAP'
      : 'ORDAL_SANDBOX_PG';
const PAYMENT_GATEWAY_WEBHOOK_SECRET =
  getConfiguredEnvSecret('PAYMENT_GATEWAY_WEBHOOK_SECRET') ||
  crypto.randomBytes(32).toString('hex');

const ALLOWED_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'QRIS',
  'VA_BCA',
  'VA_MANDIRI',
  'VA_BNI',
  'VA_BRI',
  'TRANSFER_BCA',
  'TRANSFER_MANDIRI',
  'TRANSFER_BNI',
  'TRANSFER_BRI',
  'GOPAY',
  'OVO',
  'DANA',
  'SHOPEEPAY',
  'INTERNAL_ADMIN',
];

const GATEWAY_CHANNEL_META: Record<
  GatewayChannel,
  {
    label: string;
    method: PaymentMethod;
    bankPrefix?: string;
    calcFee: (baseAmount: number) => number;
    feeLabel: string;
  }
> = {
  QRIS_DINAMIS: {
    label: 'QRIS Dinamis (BI-SNAP EMVCo)',
    method: 'QRIS',
    calcFee: (baseAmount: number) => Math.max(500, Math.round(baseAmount * 0.007)),
    feeLabel: 'MDR QRIS Dinamis (0,7% · min Rp 500)',
  },
  VA_BCA: {
    label: 'BCA Virtual Account',
    method: 'VA_BCA',
    bankPrefix: '88108',
    calcFee: () => 4000,
    feeLabel: 'Biaya Payment Gateway (Virtual Account BCA)',
  },
  VA_MANDIRI: {
    label: 'Mandiri Virtual Account',
    method: 'VA_MANDIRI',
    bankPrefix: '89026',
    calcFee: () => 4000,
    feeLabel: 'Biaya Payment Gateway (Virtual Account Mandiri)',
  },
  VA_BNI: {
    label: 'BNI Virtual Account',
    method: 'VA_BNI',
    bankPrefix: '82770',
    calcFee: () => 4000,
    feeLabel: 'Biaya Payment Gateway (Virtual Account BNI)',
  },
  VA_BRI: {
    label: 'BRI Virtual Account (BRIVA)',
    method: 'VA_BRI',
    bankPrefix: '26218',
    calcFee: () => 4000,
    feeLabel: 'Biaya Payment Gateway (Virtual Account BRI)',
  },
};

function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

function buildEmvQrisPayload(params: {
  invoiceNumber: string;
  amount: number;
  merchantName?: string;
}): string {
  const amountStr = String(Math.max(1000, Math.round(params.amount)));
  const merchantName = (params.merchantName || 'ORDAL ESPORTS HUB').slice(0, 25);
  const mai = tlv('00', 'ID.CO.QRIS.WWW') + tlv('01', '936009143000088108') + tlv('02', 'ORDAL001');
  const additional = tlv('01', params.invoiceNumber.slice(0, 20));
  const rawWithoutCrc =
    tlv('00', '01') +
    tlv('01', '12') + // Dynamic QRIS
    tlv('26', mai) +
    tlv('52', '7999') +
    tlv('53', '360') + // IDR
    tlv('54', amountStr) +
    tlv('58', 'ID') +
    tlv('59', merchantName) +
    tlv('60', 'JAKARTA') +
    tlv('61', '10110') +
    tlv('62', additional) +
    '6304';
  return rawWithoutCrc + computeCrc16Ccitt(rawWithoutCrc);
}

function buildVaNumber(channel: GatewayChannel, invoiceNumber: string): string {
  const prefix = GATEWAY_CHANNEL_META[channel]?.bankPrefix || '88108';
  const digits = Array.from(invoiceNumber)
    .map((ch) => {
      if (/\d/.test(ch)) return ch;
      return String(ch.charCodeAt(0) % 10);
    })
    .join('')
    .slice(-11)
    .padStart(11, '0');
  return `${prefix}${digits}`;
}

function appendLedgerEntry(
  db: OrdalDatabase,
  entry: Omit<SettlementLedgerEntry, 'id'>
): boolean {
  if (!Array.isArray(db.ledger)) {
    db.ledger = [];
  }
  const exists = db.ledger.some(
    (l) =>
      l.paymentId === entry.paymentId &&
      l.accountBucket === entry.accountBucket &&
      l.direction === entry.direction
  );
  if (exists) return false;
  db.ledger.unshift({
    id: makeId('ldg'),
    ...entry,
  });
  return true;
}

function recordSettlementLedgerForVerifiedPayment(
  db: OrdalDatabase,
  payment: PaymentRecord,
  actorEmail?: string
): boolean {
  let mutated = false;
  const timestamp = payment.validatedAt || new Date().toISOString();

  if (payment.category === 'SCRIM_SPLIT_BILL') {
    const baseAmt = payment.baseAmount ?? payment.amount;
    if (
      appendLedgerEntry(db, {
        timestamp,
        paymentId: payment.id,
        invoiceNumber: payment.invoiceNumber,
        scrimId: payment.scrimId,
        casterId: payment.casterId,
        direction: 'CREDIT',
        accountBucket: 'ESCROW_TEAM',
        amount: baseAmt,
        description: `Dana escrow split-bill masuk dari ${payment.payerName}`,
        actorEmail,
      })
    ) {
      mutated = true;
    }

    if ((payment.gatewayFee || 0) > 0) {
      if (
        appendLedgerEntry(db, {
          timestamp,
          paymentId: payment.id,
          invoiceNumber: payment.invoiceNumber,
          scrimId: payment.scrimId,
          direction: 'DEBIT',
          accountBucket: 'PG_FEE_EXPENSE',
          amount: payment.gatewayFee || 0,
          description: `Biaya Payment Gateway (${payment.gatewayChannel || payment.paymentMethod || 'GATEWAY'})`,
          actorEmail,
        })
      ) {
        mutated = true;
      }
    }

    const casterShare = payment.casterFeeShare ?? 0;
    const platformShare =
      payment.platformFeeShare ?? Math.max(0, baseAmt - casterShare);
    if (casterShare > 0) {
      const casterObj = payment.casterId
        ? db.casters.find((c) => c.id === payment.casterId)
        : undefined;
      if (
        appendLedgerEntry(db, {
          timestamp,
          paymentId: payment.id,
          invoiceNumber: payment.invoiceNumber,
          scrimId: payment.scrimId,
          casterId: payment.casterId,
          direction: 'CREDIT',
          accountBucket: 'CASTER_PAYABLE',
          amount: casterShare,
          description: `Alokasi honor 50% Shoutcaster${casterObj ? ` (${casterObj.name})` : ''}`,
          actorEmail,
        })
      ) {
        mutated = true;
      }
    }
    if (platformShare > 0) {
      if (
        appendLedgerEntry(db, {
          timestamp,
          paymentId: payment.id,
          invoiceNumber: payment.invoiceNumber,
          scrimId: payment.scrimId,
          direction: 'CREDIT',
          accountBucket: 'PLATFORM_REVENUE',
          amount: platformShare,
          description: `Pendapatan fee lobby platform ORDAL (50% split-bill)`,
          actorEmail,
        })
      ) {
        mutated = true;
      }
    }
  } else if (payment.category === 'CASTER_PAYOUT') {
    if (
      appendLedgerEntry(db, {
        timestamp,
        paymentId: payment.id,
        invoiceNumber: payment.invoiceNumber,
        casterId: payment.casterId,
        direction: 'DEBIT',
        accountBucket: 'CASTER_PAYABLE',
        amount: payment.amount,
        description: `Pencairan payout Shoutcaster ke ${payment.receiverName} (${payment.bankOrWallet || 'Bank/E-Wallet'})`,
        actorEmail,
      })
    ) {
      mutated = true;
    }
  } else if (payment.category === 'SCRIM_REFUND') {
    if (
      appendLedgerEntry(db, {
        timestamp,
        paymentId: payment.id,
        invoiceNumber: payment.invoiceNumber,
        scrimId: payment.scrimId,
        direction: 'DEBIT',
        accountBucket: 'ESCROW_TEAM',
        amount: payment.amount,
        description: `Pengembalian dana escrow scrim ke ${payment.receiverName}`,
        actorEmail,
      })
    ) {
      mutated = true;
    }
    if (
      appendLedgerEntry(db, {
        timestamp,
        paymentId: payment.id,
        invoiceNumber: payment.invoiceNumber,
        scrimId: payment.scrimId,
        direction: 'DEBIT',
        accountBucket: 'REFUND_PAYABLE',
        amount: payment.amount,
        description: `Penyelesaian kewajiban refund tim ${payment.receiverName}`,
        actorEmail,
      })
    ) {
      mutated = true;
    }
  }

  return mutated;
}

function recordRefundIssuanceLedger(
  db: OrdalDatabase,
  payment: PaymentRecord,
  actorEmail?: string
): boolean {
  return appendLedgerEntry(db, {
    timestamp: payment.issuedAt || new Date().toISOString(),
    paymentId: payment.id,
    invoiceNumber: payment.invoiceNumber,
    scrimId: payment.scrimId,
    direction: 'CREDIT',
    accountBucket: 'REFUND_PAYABLE',
    amount: payment.amount,
    description: `Pencatatan kewajiban refund tim ${payment.receiverName}`,
    actorEmail,
  });
}

function formatInvoiceCode(prefix: string, rawId: string, suffix = ''): string {
  const clean = rawId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-6).padStart(6, '0');
  return `INV-${prefix}-${clean}${suffix ? `-${suffix}` : ''}`;
}

function ensurePaymentRecords(db: OrdalDatabase): boolean {
  let mutated = false;
  if (!Array.isArray(db.payments)) {
    db.payments = [];
    mutated = true;
  }
  if (!Array.isArray(db.ledger)) {
    db.ledger = [];
    mutated = true;
  }

  const byId = new Map<string, PaymentRecord>(db.payments.map((p) => [p.id, p]));
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  // 1. Scrim Split-Bill Invoices (host & challenger)
  for (const sc of db.scrims || []) {
    const isBillableStatus =
      sc.status === 'AWAITING_PAYMENT' ||
      sc.status === 'PARTIALLY_PAID' ||
      sc.status === 'CONFIRMED' ||
      sc.hostPaid ||
      sc.challengerPaid;
    if (!isBillableStatus) continue;

    const casterShare = Math.round((sc.casterRate || 0) / 2);
    const platformShare = Math.max(0, sc.splitCostPerTeam - casterShare);
    const lineItems = [
      ...(casterShare > 0
        ? [{ label: `Honor Shoutcaster ${sc.casterName} (50%)`, amount: casterShare }]
        : []),
      ...(platformShare > 0
        ? [{ label: 'Lobby & Platform Escrow Fee (50%)', amount: platformShare }]
        : []),
    ];

    const sides: Array<{
      side: 'host' | 'challenger';
      teamName: string;
      email?: string;
      paid: boolean;
      suffix: string;
    }> = [
      {
        side: 'host',
        teamName: sc.hostTeamName,
        email: sc.hostUserEmail,
        paid: Boolean(sc.hostPaid),
        suffix: 'A',
      },
      ...(sc.challengerTeamName
        ? [
            {
              side: 'challenger' as const,
              teamName: sc.challengerTeamName,
              email: sc.challengerUserEmail,
              paid: Boolean(sc.challengerPaid),
              suffix: 'B',
            },
          ]
        : []),
    ];

    for (const s of sides) {
      const id = `pay-scr-${sc.id}-${s.side}`;
      const existing = byId.get(id);
      if (!existing) {
        const status = s.paid ? 'VERIFIED' : 'UNPAID';
        const history: PaymentHistoryEvent[] = [
          {
            id: makeId('pevt'),
            timestamp: sc.createdAt || nowIso,
            action: 'INVOICE_ISSUED',
            actorName: 'ORDAL Billing System',
            actorRole: 'SYSTEM',
            note: `Tagihan patungan scrim ${sc.game} (${sc.date} ${sc.timeSlot}) diterbitkan.`,
          },
          ...(s.paid
            ? [
                {
                  id: makeId('pevt'),
                  timestamp: sc.createdAt || nowIso,
                  action: 'PAYMENT_VALIDATED' as const,
                  actorName: 'ORDAL Finance',
                  actorRole: 'SUPER_ADMIN' as const,
                  note: 'Pembayaran split-bill terverifikasi lunas.',
                },
              ]
            : []),
        ];
        const rec: PaymentRecord = {
          id,
          invoiceNumber: formatInvoiceCode('SCR', sc.id, s.suffix),
          category: 'SCRIM_SPLIT_BILL',
          status,
          scrimId: sc.id,
          scrimSide: s.side,
          casterId: sc.casterId && sc.casterId !== 'none' ? sc.casterId : undefined,
          game: sc.game,
          title: `Split-Bill Scrim ${sc.game}: ${sc.hostTeamName} vs ${sc.challengerTeamName || 'OPEN'}`,
          payerName: s.teamName,
          payerEmail: s.email,
          receiverName: 'ORDAL Esports Hub',
          amount: sc.splitCostPerTeam,
          casterFeeShare: casterShare,
          platformFeeShare: platformShare,
          lineItems,
          paymentMethod: s.paid ? 'QRIS' : undefined,
          referenceCode: s.paid ? `AUTO-${sc.id.slice(-4).toUpperCase()}-${s.suffix}` : undefined,
          issuedAt: sc.createdAt || nowIso,
          dueAt: sc.paymentDeadlineAt,
          validatedAt: s.paid ? sc.createdAt || nowIso : undefined,
          validatedBy: s.paid ? 'ORDAL System' : undefined,
          history,
        };
        db.payments.unshift(rec);
        byId.set(id, rec);
        mutated = true;
      } else {
        // Keep scrim paid truth synced if paid externally via legacy/admin lock
        if (s.paid && existing.status !== 'VERIFIED') {
          existing.status = 'VERIFIED';
          existing.validatedAt = existing.validatedAt || nowIso;
          existing.validatedBy = existing.validatedBy || 'Super Admin ORDAL';
          existing.history.push({
            id: makeId('pevt'),
            timestamp: nowIso,
            action: 'PAYMENT_VALIDATED',
            actorName: existing.validatedBy,
            actorRole: 'SUPER_ADMIN',
            note: 'Status scrim dikonfirmasi lunas.',
          });
          mutated = true;
        }
        if (sc.paymentDeadlineAt !== existing.dueAt) {
          existing.dueAt = sc.paymentDeadlineAt;
          mutated = true;
        }
      }
    }

    // Refund requests on scrim
    for (const r of sc.refundRequests || []) {
      const id = `pay-rfd-${r.id}`;
      const existing = byId.get(id);
      const mappedStatus = r.status === 'REFUNDED' ? 'VERIFIED' : 'PENDING_VALIDATION';
      if (!existing) {
        const rec: PaymentRecord = {
          id,
          invoiceNumber: formatInvoiceCode('RFD', r.id),
          category: 'SCRIM_REFUND',
          status: mappedStatus,
          scrimId: sc.id,
          scrimSide: r.side,
          game: sc.game,
          title: `Refund Dana Scrim ${sc.game}: ${sc.hostTeamName}`,
          payerName: 'ORDAL Esports Hub',
          payerEmail: r.requestedByEmail,
          receiverName: r.teamName,
          amount: r.amount,
          lineItems: [{ label: `Pengembalian Dana Split-Bill (${r.reason || 'Dibatalkan'})`, amount: r.amount }],
          bankOrWallet: r.bankOrWallet,
          accountNumber: r.accountNumber,
          accountName: r.accountName,
          proofNote: r.reason,
          issuedAt: r.requestedAt || nowIso,
          submittedAt: r.requestedAt || nowIso,
          validatedAt: r.status === 'REFUNDED' ? nowIso : undefined,
          history: [
            {
              id: makeId('pevt'),
              timestamp: r.requestedAt || nowIso,
              action: 'REFUND_REQUESTED',
              actorName: r.teamName,
              actorRole: 'TEAM',
              note: `Pengajuan refund ke ${r.bankOrWallet} ${r.accountNumber} (${r.accountName}).`,
            },
            ...(r.status === 'REFUNDED'
              ? [
                  {
                    id: makeId('pevt'),
                    timestamp: nowIso,
                    action: 'PAYMENT_VALIDATED' as const,
                    actorName: 'Super Admin ORDAL',
                    actorRole: 'SUPER_ADMIN' as const,
                    note: 'Dana refund berhasil dikirim dan divalidasi.',
                  },
                ]
              : []),
          ],
        };
        db.payments.unshift(rec);
        byId.set(id, rec);
        mutated = true;
      }
    }
  }

  // 2. Caster Withdrawal Payout Slips
  for (const w of db.withdrawals || []) {
    const id = `pay-wdr-${w.id}`;
    const existing = byId.get(id);
    const mappedStatus =
      w.status === 'PAID'
        ? 'VERIFIED'
        : w.status === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING_VALIDATION';
    if (!existing) {
      const rec: PaymentRecord = {
        id,
        invoiceNumber: formatInvoiceCode('WDR', w.id),
        category: 'CASTER_PAYOUT',
        status: mappedStatus,
        withdrawalId: w.id,
        casterId: w.casterId,
        title: `Pencairan Fee Shoutcaster: ${w.casterName}`,
        payerName: 'ORDAL Esports Hub',
        receiverName: w.casterName,
        amount: w.amount,
        lineItems: [{ label: `Pencairan Honor Scrim Shoutcaster (${w.casterName})`, amount: w.amount }],
        bankOrWallet: w.bankOrWallet,
        accountNumber: w.accountNumber,
        accountName: w.accountName,
        proofNote: w.note,
        issuedAt: w.requestedAt || nowIso,
        submittedAt: w.requestedAt || nowIso,
        validatedAt: w.processedAt,
        history: [
          {
            id: makeId('pevt'),
            timestamp: w.requestedAt || nowIso,
            action: 'PAYOUT_REQUESTED',
            actorName: w.casterName,
            actorRole: 'CASTER',
            note: `Pengajuan withdraw ke ${w.bankOrWallet} ${w.accountNumber} (${w.accountName}).`,
          },
          ...(w.status === 'PAID'
            ? [
                {
                  id: makeId('pevt'),
                  timestamp: w.processedAt || nowIso,
                  action: 'PAYMENT_VALIDATED' as const,
                  actorName: 'Super Admin ORDAL',
                  actorRole: 'SUPER_ADMIN' as const,
                  note: 'Transfer pencairan fee caster telah divalidasi PAID.',
                },
              ]
            : w.status === 'REJECTED'
              ? [
                  {
                    id: makeId('pevt'),
                    timestamp: w.processedAt || nowIso,
                    action: 'PAYMENT_REJECTED' as const,
                    actorName: 'Super Admin ORDAL',
                    actorRole: 'SUPER_ADMIN' as const,
                    note: 'Pengajuan pencairan fee ditolak admin.',
                  },
                ]
              : []),
        ],
      };
      db.payments.unshift(rec);
      byId.set(id, rec);
      mutated = true;
    } else if (existing.status !== mappedStatus) {
      existing.status = mappedStatus;
      existing.validatedAt = w.processedAt || existing.validatedAt;
      mutated = true;
    }
  }

  // 3. Auto-expiry check & settlement ledger backfill
  for (const p of db.payments) {
    if (
      p.category === 'SCRIM_SPLIT_BILL' &&
      (p.status === 'UNPAID' || p.status === 'REJECTED')
    ) {
      const expiryIso = p.gatewayExpiresAt || p.dueAt;
      if (expiryIso) {
        const expMs = new Date(expiryIso).getTime();
        if (Number.isFinite(expMs) && nowMs > expMs) {
          p.status = 'EXPIRED';
          p.history.push({
            id: makeId('pevt'),
            timestamp: nowIso,
            action: 'PAYMENT_EXPIRED',
            actorName: 'ORDAL Auto-Expiry',
            actorRole: 'SYSTEM',
            note: 'Batas waktu pembayaran 15 menit berakhir; invoice otomatis kedaluwarsa.',
          });
          mutated = true;
        }
      }
    }
    if (p.category === 'SCRIM_REFUND') {
      if (recordRefundIssuanceLedger(db, p, p.payerEmail)) {
        mutated = true;
      }
    }
    if (p.status === 'VERIFIED') {
      if (recordSettlementLedgerForVerifiedPayment(db, p, p.validatedBy)) {
        mutated = true;
      }
    }
  }

  return mutated;
}

const MAX_AUDIT_LOGS = 500;

function diffChangedFields<T extends object>(
  prev: T,
  next: T,
  keys: (keyof T)[]
): string[] {
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null)) {
      changed.push(String(key));
    }
  }
  return changed;
}

function computeAuditEntryHash(entry: Omit<AuditLogEntry, 'entryHash'>): string {
  const canonical = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    actorName: entry.actorName,
    resource: entry.resource,
    action: entry.action,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    summary: entry.summary,
    changedFields: entry.changedFields || [],
    prevHash: entry.prevHash || 'GENESIS',
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function verifyAuditLogChain(logs: AuditLogEntry[]): AuditIntegrityReport {
  if (!Array.isArray(logs) || logs.length === 0) {
    return { totalLogs: 0, hashedLogs: 0, valid: true };
  }
  // Logs are stored newest-first; iterate chronologically oldest -> newest
  const chronological = [...logs].reverse();
  let hashedLogs = 0;
  let lastVerifiedHash: string | null = null;
  for (const entry of chronological) {
    if (!entry.entryHash) {
      // Once hashing has begun, an unhashed newer entry indicates tampering
      if (lastVerifiedHash !== null) {
        return { totalLogs: logs.length, hashedLogs, valid: false, brokenAtId: entry.id };
      }
      continue;
    }
    hashedLogs += 1;
    const { entryHash, ...rest } = entry;
    const expected = computeAuditEntryHash(rest);
    if (entryHash !== expected) {
      return { totalLogs: logs.length, hashedLogs, valid: false, brokenAtId: entry.id };
    }
    if (lastVerifiedHash !== null && entry.prevHash !== lastVerifiedHash) {
      return { totalLogs: logs.length, hashedLogs, valid: false, brokenAtId: entry.id };
    }
    lastVerifiedHash = entryHash;
  }
  return { totalLogs: logs.length, hashedLogs, valid: true };
}

function appendAuditLog(
  db: OrdalDatabase,
  req: express.Request,
  entry: {
    resource: AuditResource;
    action: AuditAction;
    targetId: string;
    targetLabel: string;
    summary: string;
    changedFields?: string[];
  }
): void {
  const actor = getAuthenticatedUser(req);
  if (!actor || (actor.role !== 'SUPER_ADMIN' && actor.role !== 'LEAGUE_OPS')) return;
  if (!Array.isArray(db.auditLogs)) {
    db.auditLogs = [];
  }
  const actorNameLabel =
    actor.role === 'LEAGUE_OPS' ? `${actor.displayName} [LEAGUE OPS]` : actor.displayName;
  const prevHash = db.auditLogs[0]?.entryHash || 'GENESIS';
  const baseLog: Omit<AuditLogEntry, 'entryHash'> = {
    id: makeId('aud'),
    timestamp: new Date().toISOString(),
    actorId: actor.id,
    actorEmail: actor.email,
    actorName: actorNameLabel,
    resource: entry.resource,
    action: entry.action,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    summary: entry.summary,
    changedFields: entry.changedFields && entry.changedFields.length > 0 ? entry.changedFields : undefined,
    prevHash,
  };
  const log: AuditLogEntry = {
    ...baseLog,
    entryHash: computeAuditEntryHash(baseLog),
  };
  db.auditLogs.unshift(log);
  if (db.auditLogs.length > MAX_AUDIT_LOGS) {
    db.auditLogs = db.auditLogs.slice(0, MAX_AUDIT_LOGS);
  }
}

async function startServer() {
  syncSeedCredentialsFromEnv();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust loopback nginx and Cloud Run link-local proxy hops so req.ip resolves consistently to client IP
  app.set('trust proxy', (ip: string) => {
    const clean = String(ip || '').trim().replace(/^::ffff:/, '');
    return isLoopbackIp(clean) || clean.startsWith('169.254.');
  });

  // Hide framework fingerprint
  app.disable('x-powered-by');

  const strictHeadersMode =
    getConfiguredEnvSecret('STRICT_PRODUCTION_HEADERS') === 'true' ||
    (process.env.NODE_ENV === 'production' && getConfiguredEnvSecret('ALLOW_PREVIEW_IFRAME') === 'false');
  const configuredFrameAncestors = getConfiguredEnvSecret('CSP_FRAME_ANCESTORS') || '';

  // HTTP Security Headers (iframe-safe for preview environments; tightens in strict production mode)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (strictHeadersMode && !configuredFrameAncestors) {
      res.setHeader('X-Frame-Options', 'DENY');
    }
    const cspDirectives = [
      "default-src 'self'",
      strictHeadersMode
        ? "script-src 'self' https://challenges.cloudflare.com https://apis.google.com https://www.gstatic.com https://accounts.google.com"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://apis.google.com https://www.gstatic.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "frame-src 'self' https://www.youtube.com https://player.twitch.tv https://challenges.cloudflare.com https://*.firebaseapp.com https://accounts.google.com",
      "connect-src 'self' https: wss:",
      "object-src 'none'",
      "base-uri 'self'",
    ];
    if (configuredFrameAncestors) {
      cspDirectives.push(`frame-ancestors ${configuredFrameAncestors}`);
    } else if (strictHeadersMode) {
      cspDirectives.push("frame-ancestors 'none'");
    }
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  app.use(express.json({ limit: '5mb' }));

  // SOC Security Patch Middleware: IP Blocklist + WAF Inspection + Strict API Headers
  app.use(socProtectionMiddleware);

  // CSRF & Same-Origin Enforcement for cookie-authenticated API mutations
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Enforce matching Origin host on state-changing API calls when Origin header is present
    const originHeader = String(req.headers.origin || '').trim();
    if (originHeader && req.path !== '/payments/webhook') {
      try {
        const originHost = new URL(originHeader).host.toLowerCase();
        const forwardedHost = String(req.headers['x-forwarded-host'] || '')
          .split(',')[0]
          .trim()
          .toLowerCase();
        const directHost = String(req.headers.host || '').trim().toLowerCase();
        const expectedHost = forwardedHost || directHost;
        if (expectedHost && originHost !== expectedHost) {
          recordSocEvent({
            severity: 'HIGH',
            category: 'RBAC_VIOLATION',
            ip: getClientIp(req),
            method: req.method,
            path: `/api${req.path}`,
            userAgent: String(req.headers['user-agent'] || ''),
            summary: `Permintaan mutasi lintas-origin diblokir (Origin: ${originHost}, Host: ${expectedHost}).`,
          });
          return res.status(403).json({ error: 'Permintaan lintas-origin tidak diizinkan.' });
        }
      } catch {
        return res.status(403).json({ error: 'Header Origin tidak valid.' });
      }
    }

    const cookies = parseCookies(req);
    const hasSessionCookie = Boolean(cookies[SESSION_COOKIE_NAME]);
    if (!hasSessionCookie) {
      return next();
    }

    // Pre-auth endpoints or webhook do not rely on session cookies
    if (
      req.path === '/auth/login' ||
      req.path === '/auth/login/mfa' ||
      req.path === '/auth/claim-admin' ||
      req.path === '/auth/register' ||
      req.path === '/auth/forgot-password' ||
      req.path === '/auth/reset-password' ||
      req.path === '/payments/webhook'
    ) {
      return next();
    }

    const authCtx = resolveAuthContext(req, res);
    if (!authCtx) {
      // Allow logout to clear stale cookies cleanly
      if (req.path === '/auth/logout') {
        return next();
      }
      return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
    }

    if (authCtx.source === 'cookie') {
      const providedCsrf = String(req.headers['x-csrf-token'] || '').trim();
      const expectedCsrf = deriveCsrfToken(authCtx.tokenHash);
      if (!constantTimeHexEqual(providedCsrf, expectedCsrf)) {
        recordSocEvent({
          severity: 'HIGH',
          category: 'RBAC_VIOLATION',
          ip: getClientIp(req),
          method: req.method,
          path: `/api${req.path}`,
          actorEmail: authCtx.user.email,
          actorRole: authCtx.user.role,
          userAgent: String(req.headers['user-agent'] || ''),
          summary: `Validasi CSRF gagal pada ${req.method} /api${req.path} oleh ${authCtx.user.email}.`,
        });
        return res.status(403).json({
          error: 'Token keamanan CSRF tidak valid atau kedaluwarsa.',
          code: 'CSRF_MISMATCH',
        });
      }
    }

    next();
  });

  // Rate limiters for sensitive endpoints
  const authRateLimiter = createRateLimiter(
    20,
    5 * 60 * 1000,
    'Terlalu banyak percobaan autentikasi. Silakan coba lagi dalam 5 menit.'
  );
  const withdrawRateLimiter = createRateLimiter(
    10,
    10 * 60 * 1000,
    'Terlalu banyak permintaan withdraw. Silakan tunggu beberapa menit.'
  );
  const writeRateLimiter = createRateLimiter(
    15,
    5 * 60 * 1000,
    'Terlalu banyak permintaan pembuatan data. Silakan tunggu beberapa menit.'
  );

  // Serve public assets explicitly so /assets/aistudio/* always resolves
  app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

  // --- AUTHENTICATION & TEAM PROFILE ROUTES ---
  app.post('/api/auth/login', authRateLimiter, (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }
    const store = loadAuthStore();
    const userIdx = store.users.findIndex((u) => u.email.toLowerCase() === email);
    const user = userIdx !== -1 ? store.users[userIdx] : null;
    if (user && user.role === 'SUPER_ADMIN' && isAdminSetupRequired(store)) {
      return res.status(403).json({
        error:
          'Password awal Super Admin belum ditetapkan. Silakan tetapkan password melalui formulir Aktivasi Awal Super Admin di halaman login.',
        adminSetupRequired: true,
      });
    }

    const verification = user
      ? verifyPassword(password, user.passwordHash)
      : { valid: false, needsUpgrade: false };

    if (!user || !verification.valid) {
      const { autoBlocked } = handleSocLoginFailure(req, email);
      return res.status(autoBlocked ? 403 : 401).json({
        error: autoBlocked
          ? 'Terlalu banyak percobaan login gagal. IP Anda diblokir sementara oleh SOC.'
          : 'Email atau password salah.',
      });
    }

    clearSocLoginFailures(req);

    // Transparently upgrade legacy static-salt password hash to per-user random salt
    if (verification.needsUpgrade) {
      store.users[userIdx].passwordHash = hashPassword(password);
      saveAuthStore(store);
    }

    const activeUser = store.users[userIdx];
    if (activeUser.totpEnabled && activeUser.totpSecret) {
      const now = Date.now();
      for (const [k, ch] of mfaChallenges.entries()) {
        if (ch.expiresAt <= now) mfaChallenges.delete(k);
      }
      const mfaToken = crypto.randomBytes(24).toString('hex');
      mfaChallenges.set(mfaToken, {
        userId: activeUser.id,
        expiresAt: now + MFA_CHALLENGE_TTL_MS,
        attempts: 0,
        ipPrefix: computeIpPrefix(getClientIp(req)),
        uaHash: computeUaHash(req),
      });
      return res.json({
        mfaRequired: true,
        mfaToken,
        email: activeUser.email,
        displayName: activeUser.displayName,
        role: activeUser.role,
      });
    }

    const { csrfToken } = issueSessionForUser(req, res, store, activeUser);
    saveAuthStore(store);
    res.json({
      mfaRequired: false,
      user: toPublicUser(activeUser),
      csrfToken,
      idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
    });
  });

  // Step 2 MFA verification (TOTP 6-digit or single-use recovery code)
  app.post('/api/auth/login/mfa', authRateLimiter, (req, res) => {
    const mfaToken = String(req.body.mfaToken || '').trim();
    const code = String(req.body.code || '').trim();
    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'Token sesi 2FA dan kode verifikasi wajib diisi.' });
    }

    const challenge = mfaChallenges.get(mfaToken);
    if (!challenge || Date.now() > challenge.expiresAt) {
      mfaChallenges.delete(mfaToken);
      return res.status(401).json({
        error: 'Sesi verifikasi 2FA telah kedaluwarsa. Silakan login ulang dengan email & password.',
      });
    }
    if (
      challenge.ipPrefix !== computeIpPrefix(getClientIp(req)) ||
      challenge.uaHash !== computeUaHash(req)
    ) {
      mfaChallenges.delete(mfaToken);
      recordSocEvent({
        severity: 'HIGH',
        category: 'SESSION_HIJACK',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        summary: 'Token tantangan 2FA digunakan dari jaringan/perangkat berbeda.',
      });
      return res.status(401).json({ error: 'Sesi verifikasi 2FA tidak valid. Silakan login ulang.' });
    }

    const store = loadAuthStore();
    const userIdx = store.users.findIndex((u) => u.id === challenge.userId);
    if (userIdx === -1) {
      mfaChallenges.delete(mfaToken);
      return res.status(401).json({ error: 'Akun tidak ditemukan.' });
    }
    const user = store.users[userIdx];
    if (!user.totpEnabled || !user.totpSecret) {
      mfaChallenges.delete(mfaToken);
      return res.status(400).json({ error: '2FA belum aktif pada akun ini.' });
    }

    const totpCheck = verifyTotpCode(user.totpSecret, code, user.totpLastUsedStep);
    let verifiedVia: 'TOTP' | 'RECOVERY' | null = null;
    if (totpCheck.valid && totpCheck.matchedStep !== undefined) {
      user.totpLastUsedStep = totpCheck.matchedStep;
      verifiedVia = 'TOTP';
    } else if (!totpCheck.replayed && Array.isArray(user.totpRecoveryHashes)) {
      const candidateHash = hashRecoveryCode(code, user.id);
      const matchIdx = user.totpRecoveryHashes.findIndex((h) => constantTimeHexEqual(h, candidateHash));
      if (matchIdx !== -1) {
        user.totpRecoveryHashes.splice(matchIdx, 1);
        verifiedVia = 'RECOVERY';
      }
    }

    if (!verifiedVia) {
      challenge.attempts += 1;
      if (challenge.attempts >= 5) {
        mfaChallenges.delete(mfaToken);
      }
      recordSocEvent({
        severity: 'MEDIUM',
        category: 'AUTH_FAILURE',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        actorEmail: user.email,
        actorRole: user.role,
        summary: totpCheck.replayed
          ? `Percobaan replay kode TOTP 2FA pada akun ${user.email}.`
          : `Kode 2FA salah (${challenge.attempts}/5) untuk akun ${user.email}.`,
      });
      return res.status(401).json({
        error: totpCheck.replayed
          ? 'Kode authenticator baru saja digunakan. Tunggu kode 30 detik berikutnya.'
          : challenge.attempts >= 5
            ? 'Terlalu banyak kode 2FA salah. Silakan ulangi login dari awal.'
            : 'Kode 2FA atau Recovery Code salah.',
      });
    }

    mfaChallenges.delete(mfaToken);
    clearSocLoginFailures(req);
    const { csrfToken } = issueSessionForUser(req, res, store, user);
    saveAuthStore(store);

    if (verifiedVia === 'RECOVERY') {
      recordSocEvent({
        severity: 'MEDIUM',
        category: 'POLICY_CHANGE',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        actorEmail: user.email,
        actorRole: user.role,
        summary: `Login 2FA berhasil menggunakan Recovery Code (sisa ${user.totpRecoveryHashes?.length ?? 0}) oleh ${user.email}.`,
        status: 'OPEN',
      });
    }

    res.json({
      mfaRequired: false,
      user: toPublicUser(user),
      csrfToken,
      idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
    });
  });

  // 2FA TOTP Setup & Management (SUPER_ADMIN & LEAGUE_OPS)
  app.post('/api/auth/2fa/setup', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), async (req, res) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
      const store = loadAuthStore();
      const idx = store.users.findIndex((u) => u.id === authUser.id);
      if (idx === -1) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

      const user = store.users[idx];
      if (user.totpEnabled && user.totpSecret) {
        return res.status(400).json({ error: '2FA sudah aktif. Nonaktifkan terlebih dahulu jika ingin mengatur ulang.' });
      }

      const secret = generateBase32Secret(20);
      const issuer = 'ORDAL Esports';
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 220,
        margin: 1,
        color: { dark: '#0A0C10', light: '#FFFFFF' },
      });

      user.totpPendingSecret = secret;
      saveAuthStore(store);

      res.json({
        secret,
        otpauthUrl,
        qrDataUrl,
        issuer,
        accountName: user.email,
      });
    } catch {
      res.status(500).json({ error: 'Gagal membuat QR Code setup 2FA.' });
    }
  });

  app.post('/api/auth/2fa/verify-setup', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
    const code = String(req.body.code || '').trim();
    if (!/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
      return res.status(400).json({ error: 'Masukkan 6 digit kode dari aplikasi Authenticator.' });
    }

    const store = loadAuthStore();
    const idx = store.users.findIndex((u) => u.id === authUser.id);
    if (idx === -1) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    const user = store.users[idx];
    if (!user.totpPendingSecret) {
      return res.status(400).json({ error: 'Belum ada proses setup 2FA yang dimulai.' });
    }

    const check = verifyTotpCode(user.totpPendingSecret, code);
    if (!check.valid || check.matchedStep === undefined) {
      return res.status(400).json({ error: 'Kode verifikasi salah atau kedaluwarsa. Periksa waktu perangkat Anda.' });
    }

    const { plain, hashes } = generateRecoveryCodes(user.id, 6);
    user.totpSecret = user.totpPendingSecret;
    delete user.totpPendingSecret;
    user.totpEnabled = true;
    user.totpLastUsedStep = check.matchedStep;
    user.totpRecoveryHashes = hashes;
    saveAuthStore(store);

    const db = loadDb();
    appendAuditLog(db, req, {
      resource: 'USER',
      action: 'UPDATE',
      targetId: user.id,
      targetLabel: `${user.displayName} (${user.email})`,
      summary: `Mengaktifkan autentikasi 2FA TOTP untuk akun ${user.role} (${user.email})`,
      changedFields: ['totpEnabled'],
    });
    saveDb(db);

    recordSocEvent({
      severity: 'LOW',
      category: 'POLICY_CHANGE',
      ip: getClientIp(req),
      method: req.method,
      path: req.path,
      actorEmail: user.email,
      actorRole: user.role,
      summary: `2FA Authenticator diaktifkan oleh ${user.email} (${user.role}).`,
      status: 'RESOLVED',
    });

    res.json({
      ok: true,
      user: toPublicUser(user),
      recoveryCodes: plain,
    });
  });

  app.post('/api/auth/2fa/disable', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
    const password = String(req.body.password || '');
    const code = String(req.body.code || '').trim();
    if (!password || !code) {
      return res.status(400).json({ error: 'Password akun dan kode 2FA / Recovery Code wajib diisi.' });
    }

    const store = loadAuthStore();
    const idx = store.users.findIndex((u) => u.id === authUser.id);
    if (idx === -1) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    const user = store.users[idx];

    if (!verifyPassword(password, user.passwordHash).valid) {
      return res.status(401).json({ error: 'Password akun salah.' });
    }
    if (!user.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ error: '2FA belum aktif pada akun ini.' });
    }

    const totpOk = verifyTotpCode(user.totpSecret, code, user.totpLastUsedStep).valid;
    const recoveryHash = hashRecoveryCode(code, user.id);
    const recoveryOk = Array.isArray(user.totpRecoveryHashes)
      ? user.totpRecoveryHashes.some((h) => constantTimeHexEqual(h, recoveryHash))
      : false;
    if (!totpOk && !recoveryOk) {
      return res.status(401).json({ error: 'Kode 2FA atau Recovery Code tidak valid.' });
    }

    user.totpEnabled = false;
    delete user.totpSecret;
    delete user.totpPendingSecret;
    delete user.totpLastUsedStep;
    delete user.totpRecoveryHashes;
    saveAuthStore(store);

    const db = loadDb();
    appendAuditLog(db, req, {
      resource: 'USER',
      action: 'UPDATE',
      targetId: user.id,
      targetLabel: `${user.displayName} (${user.email})`,
      summary: `Menonaktifkan 2FA TOTP pada akun ${user.role} (${user.email})`,
      changedFields: ['totpEnabled'],
    });
    saveDb(db);

    recordSocEvent({
      severity: 'MEDIUM',
      category: 'POLICY_CHANGE',
      ip: getClientIp(req),
      method: req.method,
      path: req.path,
      actorEmail: user.email,
      actorRole: user.role,
      summary: `2FA Authenticator dinonaktifkan pada akun ${user.email}.`,
      status: 'OPEN',
    });

    res.json({ ok: true, user: toPublicUser(user) });
  });

  // One-time initial password setup for Super Admin when SEED_ADMIN_PASSWORD is not configured
  app.post('/api/auth/claim-admin', authRateLimiter, (req, res) => {
    const store = loadAuthStore();
    if (!isAdminSetupRequired(store)) {
      return res.status(403).json({
        error: 'Aktivasi awal Super Admin sudah selesai atau dikunci oleh konfigurasi server. Silakan masuk melalui form login.',
      });
    }

    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword ?? password);
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password Super Admin minimal 8 karakter.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Konfirmasi password tidak cocok.' });
    }

    const adminIdx = store.users.findIndex((u) => u.role === 'SUPER_ADMIN');
    if (adminIdx === -1) {
      return res.status(404).json({ error: 'Akun Super Admin tidak ditemukan.' });
    }

    store.users[adminIdx].passwordHash = hashPassword(password);
    store.adminClaimed = true;
    for (const [tokHash, sess] of Object.entries(store.sessions)) {
      if (sess.userId === store.users[adminIdx].id) {
        delete store.sessions[tokHash];
      }
    }

    clearSocLoginFailures(req);
    const { csrfToken } = issueSessionForUser(req, res, store, store.users[adminIdx]);
    saveAuthStore(store);

    recordSocEvent({
      severity: 'LOW',
      category: 'POLICY_CHANGE',
      ip: getClientIp(req),
      method: 'POST',
      path: '/api/auth/claim-admin',
      actorEmail: store.users[adminIdx].email,
      actorRole: 'SUPER_ADMIN',
      userAgent: String(req.headers['user-agent'] || ''),
      summary: `Password awal Super Admin (${store.users[adminIdx].email}) berhasil ditetapkan melalui aktivasi perdana.`,
      status: 'RESOLVED',
    });

    res.json({
      user: toPublicUser(store.users[adminIdx]),
      csrfToken,
      idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
    });
  });

  // Forgot Password (TEAM & CASTER only — strictly disabled for SUPER_ADMIN & LEAGUE_OPS)
  app.post('/api/auth/forgot-password', authRateLimiter, async (req, res) => {
    try {
      const captchaCheck = await verifyTurnstileIfConfigured(req);
      if (!captchaCheck.ok) {
        return res.status(captchaCheck.status || 400).json({ error: captchaCheck.error });
      }

      const email = String(req.body.email || '').trim().toLowerCase();
      const requestedRole = String(req.body.role || '').trim().toUpperCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Masukkan alamat email yang valid.' });
      }
      if (requestedRole !== 'TEAM' && requestedRole !== 'CASTER') {
        return res.status(403).json({
          error: 'Fitur lupa password hanya tersedia untuk role Team (User Publik) dan Caster.',
        });
      }

      const genericOkPayload = {
        ok: true,
        email,
        role: requestedRole,
        expiresInMinutes: 10,
        message:
          'Jika email terdaftar dengan role tersebut, kode verifikasi 6 digit telah dikirimkan (berlaku 10 menit).',
      };

      const store = loadAuthStore();
      const user = store.users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        return res.json(genericOkPayload);
      }
      if (user.role === 'SUPER_ADMIN' || user.role === 'LEAGUE_OPS') {
        recordSocEvent({
          severity: 'HIGH',
          category: 'RBAC_VIOLATION',
          ip: getClientIp(req),
          method: req.method,
          path: req.path,
          actorEmail: email,
          userAgent: String(req.headers['user-agent'] || ''),
          summary: `Percobaan reset password ke akun ${user.role} (${email}) diblokir otomatis.`,
        });
        return res.status(403).json({
          error: 'Reset password mandiri dinonaktifkan untuk akun operasional. Hubungi Super Admin.',
        });
      }
      if (user.role !== requestedRole) {
        return res.json(genericOkPayload);
      }

      const code = String(crypto.randomInt(100000, 999999));
      const codeHash = crypto
        .createHash('sha256')
        .update(`${code}:${email}`)
        .digest('hex');

      if (!store.passwordResets) {
        store.passwordResets = {};
      }
      store.passwordResets[email] = {
        userId: user.id,
        email,
        role: user.role,
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      };
      saveAuthStore(store);

      const emailed = await sendPasswordResetEmailIfConfigured(email, code, user.role);
      console.info(
        `[AUTH] Password reset OTP generated for ${email} (${user.role}), emailDelivered=${emailed}.`
      );
      res.json(genericOkPayload);
    } catch {
      res.status(500).json({ error: 'Gagal memproses permintaan reset password.' });
    }
  });

  app.post('/api/auth/reset-password', authRateLimiter, (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '');

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, kode verifikasi, dan password baru wajib diisi.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
    }

    const store = loadAuthStore();
    const record = store.passwordResets?.[email];
    if (!record) {
      return res.status(400).json({ error: 'Permintaan reset password tidak ditemukan. Minta kode baru.' });
    }
    if (Date.now() > record.expiresAt) {
      delete store.passwordResets![email];
      saveAuthStore(store);
      return res.status(400).json({ error: 'Kode verifikasi sudah kedaluwarsa. Silakan minta kode baru.' });
    }
    if (record.attempts >= 5) {
      delete store.passwordResets![email];
      saveAuthStore(store);
      return res.status(429).json({
        error: 'Terlalu banyak percobaan kode salah. Silakan minta kode verifikasi baru.',
      });
    }

    const incomingHash = crypto
      .createHash('sha256')
      .update(`${code}:${email}`)
      .digest('hex');
    const aBuf = Buffer.from(incomingHash, 'hex');
    const bBuf = Buffer.from(record.codeHash, 'hex');
    const isMatch = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);

    if (!isMatch) {
      record.attempts += 1;
      saveAuthStore(store);
      return res.status(400).json({ error: 'Kode verifikasi salah. Periksa kembali 6 digit kode Anda.' });
    }

    const userIdx = store.users.findIndex((u) => u.id === record.userId);
    if (userIdx === -1) {
      return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    }
    const targetUser = store.users[userIdx];
    if (targetUser.role !== 'TEAM' && targetUser.role !== 'CASTER') {
      return res.status(403).json({ error: 'Reset password tidak diizinkan untuk role ini.' });
    }

    // Update password hash and revoke all active sessions for this user
    targetUser.passwordHash = hashPassword(newPassword);
    for (const [tokHash, sess] of Object.entries(store.sessions)) {
      if (sess.userId === targetUser.id) {
        delete store.sessions[tokHash];
      }
    }
    delete store.passwordResets![email];
    saveAuthStore(store);

    res.json({
      ok: true,
      message: 'Password berhasil diperbarui! Silakan login dengan password baru Anda.',
    });
  });

  app.post('/api/auth/register', authRateLimiter, async (req, res) => {
    try {
      const captchaCheck = await verifyTurnstileIfConfigured(req);
      if (!captchaCheck.ok) {
        return res.status(captchaCheck.status || 400).json({ error: captchaCheck.error });
      }

      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const teamName = String(req.body.teamName || '').trim().toUpperCase();
      const teamTag = String(req.body.teamTag || '').trim().toUpperCase().slice(0, 5);
      const captainIgn = String(req.body.captainIgn || '').trim();
      const captainContact = String(req.body.captainContact || '').trim();
      const primaryGame = (req.body.primaryGame || 'POINT BLANK') as ScrimGame;

    if (!email || !password || !teamName || !teamTag || !captainIgn) {
      return res.status(400).json({ error: 'Lengkapi semua field pendaftaran tim.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Format alamat email tidak valid.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password minimal 8 karakter demi keamanan akun Anda.' });
    }

    const store = loadAuthStore();
    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      return res.status(409).json({ error: 'Email sudah terdaftar. Silakan login.' });
    }

    const newUser: StoredUser = {
      id: makeId('usr-team'),
      email,
      displayName: teamName,
      role: 'TEAM',
      passwordHash: hashPassword(password),
      teamProfile: {
        teamName,
        teamTag,
        teamLogo: '',
        primaryGame,
        captainIgn,
        captainContact,
        rosterCore: [captainIgn],
        rosterSub: [],
      },
    };
    store.users.push(newUser);
    const { csrfToken } = issueSessionForUser(req, res, store, newUser);
    saveAuthStore(store);
    res.status(201).json({
      user: toPublicUser(newUser),
      csrfToken,
      idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
    });
    } catch {
      res.status(500).json({ error: 'Gagal memproses pendaftaran akun tim.' });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const store = loadAuthStore();
    const setupRequired = isAdminSetupRequired(store);
    const adminUser = setupRequired ? store.users.find((u) => u.role === 'SUPER_ADMIN') : null;
    const authCtx = resolveAuthContext(req, res);
    if (!authCtx) {
      return res.json({
        authenticated: false,
        user: null,
        csrfToken: null,
        idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
        adminSetupRequired: setupRequired,
        adminEmail: adminUser?.email || null,
      });
    }
    const csrfToken = deriveCsrfToken(authCtx.tokenHash);
    if (authCtx.source === 'cookie') {
      const currentCookies = parseCookies(req);
      if (currentCookies[CSRF_COOKIE_NAME] !== csrfToken) {
        const isPrivilegedRole =
          authCtx.user.role === 'SUPER_ADMIN' || authCtx.user.role === 'LEAGUE_OPS';
        res.setHeader(
          'Set-Cookie',
          buildCookieString(CSRF_COOKIE_NAME, csrfToken, {
            httpOnly: false,
            secure: isHttpsRequest(req),
            maxAgeSeconds: isPrivilegedRole ? undefined : SESSION_TTL_HOURS * 3600,
          })
        );
      }
    }
    res.json({
      authenticated: true,
      user: toPublicUser(authCtx.user),
      csrfToken,
      idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
      adminSetupRequired: setupRequired,
      adminEmail: adminUser?.email || null,
    });
  });

  app.post('/api/auth/keep-alive', (req, res) => {
    const authCtx = resolveAuthContext(req, res);
    if (!authCtx) {
      return res.status(401).json({ error: 'Sesi telah berakhir karena tidak ada aktivitas.' });
    }

    const store = loadAuthStore();
    const existingSession = store.sessions[authCtx.tokenHash];
    if (!existingSession) {
      return res.status(401).json({ error: 'Sesi tidak ditemukan atau telah dicabut.' });
    }

    const now = Date.now();
    if (authCtx.source === 'cookie') {
      // Rotate session token on every keep-alive to narrow replay window
      const nextRawToken = crypto.randomBytes(32).toString('hex');
      const nextTokenHash = hashSessionToken(nextRawToken);
      const nextCsrfToken = deriveCsrfToken(nextTokenHash);

      recentlyRotatedTokens.set(authCtx.tokenHash, {
        userId: authCtx.user.id,
        invalidatedAt: now,
        ipPrefix: existingSession.ipPrefix,
        uaHash: existingSession.uaHash,
      });

      delete store.sessions[authCtx.tokenHash];
      store.sessions[nextTokenHash] = {
        ...existingSession,
        lastActivityAt: now,
        lastRotatedAt: now,
      };
      pruneSessions(store, now);
      saveAuthStore(store);

      setAuthCookies(req, res, nextRawToken, nextCsrfToken, authCtx.user.role);

      return res.json({
        ok: true,
        lastActivityAt: now,
        idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
        csrfToken: nextCsrfToken,
      });
    }

    existingSession.lastActivityAt = now;
    pruneSessions(store, now);
    saveAuthStore(store);

    res.json({
      ok: true,
      lastActivityAt: now,
      idleTimeoutMs: INACTIVITY_TIMEOUT_MS,
      csrfToken: deriveCsrfToken(authCtx.tokenHash),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const { rawToken } = extractRawSession(req);
    if (rawToken) {
      const tokenHash = hashSessionToken(rawToken);
      const store = loadAuthStore();
      if (store.sessions[tokenHash]) {
        delete store.sessions[tokenHash];
        saveAuthStore(store);
      }
    }
    clearAuthCookies(req, res);
    res.json({ ok: true });
  });

  app.put('/api/team/profile', requireRoles('TEAM'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

    const store = loadAuthStore();
    const idx = store.users.findIndex((u) => u.id === authUser.id);
    if (idx === -1) return res.status(404).json({ error: 'Akun tim tidak ditemukan.' });

    const existing = store.users[idx].teamProfile || {
      teamName: store.users[idx].displayName,
      teamTag: 'TEAM',
      teamLogo: '',
      primaryGame: 'POINT BLANK' as ScrimGame,
      captainIgn: '',
      captainContact: '',
      rosterCore: [],
      rosterSub: [],
    };

    const logoCheck = sanitizeImageUrl(req.body.teamLogo ?? existing.teamLogo);
    if (!logoCheck.ok) {
      return res.status(400).json({ error: logoCheck.error });
    }

    const parseRoster = (val: unknown, fallback: string[]): string[] => {
      if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
      if (typeof val === 'string') {
        return val
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
      }
      return fallback;
    };

    const requestedGame = String(req.body.primaryGame ?? existing.primaryGame).toUpperCase();
    const validGames: ScrimGame[] = ['POINT BLANK', 'FREE FIRE', 'EFOOTBALL'];
    const nextPrimaryGame: ScrimGame = validGames.includes(requestedGame as ScrimGame)
      ? (requestedGame as ScrimGame)
      : existing.primaryGame;

    if (nextPrimaryGame !== existing.primaryGame) {
      const db = loadDb();
      const myNameUpper = (existing.teamName || store.users[idx].displayName || '').trim().toUpperCase();
      const myEmailLower = store.users[idx].email.toLowerCase();

      const hasActiveScrim = db.scrims.some(
        (s) =>
          s.game === existing.primaryGame &&
          s.status !== 'CANCELLED' &&
          !s.resultRecorded &&
          (s.hostUserId === authUser.id ||
            s.challengerUserId === authUser.id ||
            (s.hostUserEmail && s.hostUserEmail.toLowerCase() === myEmailLower) ||
            (s.challengerUserEmail && s.challengerUserEmail.toLowerCase() === myEmailLower) ||
            (myNameUpper &&
              (s.hostTeamName.trim().toUpperCase() === myNameUpper ||
                s.challengerTeamName.trim().toUpperCase() === myNameUpper)))
      );
      if (hasActiveScrim) {
        return res.status(409).json({
          error: `Tidak dapat mengganti Game Utama selama tim masih memiliki sesi Scrim aktif di cabang ${existing.primaryGame}.`,
        });
      }

      const myTagUpper = (existing.teamTag || '').trim().toUpperCase();
      const hasActiveTournament = db.squads.some((sq) => {
        const trn = db.tournaments.find((t) => t.id === sq.tournamentId);
        if (!trn || trn.game !== existing.primaryGame || trn.status === 'COMPLETED') return false;
        return (
          (myNameUpper && sq.name.trim().toUpperCase() === myNameUpper) ||
          (myTagUpper && sq.tag.trim().toUpperCase() === myTagUpper)
        );
      });
      if (hasActiveTournament) {
        return res.status(409).json({
          error: `Tidak dapat mengganti Game Utama selama tim masih terdaftar di turnamen aktif cabang ${existing.primaryGame}.`,
        });
      }
    }

    const nextProfile: TeamProfile = {
      teamName: String(req.body.teamName ?? existing.teamName).trim().toUpperCase(),
      teamTag: String(req.body.teamTag ?? existing.teamTag).trim().toUpperCase().slice(0, 5),
      teamLogo: logoCheck.value || '',
      primaryGame: nextPrimaryGame,
      captainIgn: String(req.body.captainIgn ?? existing.captainIgn).trim(),
      captainContact: String(req.body.captainContact ?? existing.captainContact).trim(),
      rosterCore: parseRoster(req.body.rosterCore, existing.rosterCore),
      rosterSub: parseRoster(req.body.rosterSub, existing.rosterSub),
    };

    store.users[idx] = {
      ...store.users[idx],
      displayName: nextProfile.teamName || store.users[idx].displayName,
      teamProfile: nextProfile,
    };
    saveAuthStore(store);
    res.json({ user: toPublicUser(store.users[idx]) });
  });

  // --- Full State (Role-Scoped PII Filtering) ---
  app.get('/api/state', (req, res) => {
    const db = loadDb();
    const authUser = getAuthenticatedUser(req);
    res.json(sanitizeStateForRole(db, authUser));
  });

  app.post('/api/reset', requireRoles('SUPER_ADMIN'), (_req, res) => {
    const seed = createSeedDatabase();
    saveDb(seed);
    res.json(seed);
  });

  // --- HERO SETTINGS (SUPER ADMIN) ---
  app.put('/api/hero-settings', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const prev: HeroSettings = { ...DEFAULT_HERO_SETTINGS, ...(db.heroSettings || {}) };

    const bgCheck = sanitizeImageUrl(
      req.body.backgroundImageUrl !== undefined ? req.body.backgroundImageUrl : prev.backgroundImageUrl
    );
    if (!bgCheck.ok) {
      return res.status(400).json({ error: bgCheck.error });
    }

    const rawHref =
      req.body.secondaryCtaHref !== undefined
        ? String(req.body.secondaryCtaHref).trim()
        : prev.secondaryCtaHref;
    const isSafeHref =
      !rawHref ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('/') ||
      /^https?:\/\//i.test(rawHref);
    if (!isSafeHref) {
      return res.status(400).json({
        error: 'URL Secondary CTA tidak valid. Gunakan anchor (#turnamen), path (/), atau https://.',
      });
    }

    const featuredId =
      req.body.featuredTournamentId !== undefined
        ? String(req.body.featuredTournamentId).trim()
        : prev.featuredTournamentId;
    if (featuredId && !db.tournaments.some((t) => t.id === featuredId)) {
      return res.status(400).json({ error: 'Turnamen unggulan yang dipilih tidak ditemukan.' });
    }

    const nextHero: HeroSettings = {
      eyebrowPrimary: String(
        req.body.eyebrowPrimary !== undefined ? req.body.eyebrowPrimary : prev.eyebrowPrimary
      )
        .trim()
        .slice(0, 80),
      eyebrowSecondary: String(
        req.body.eyebrowSecondary !== undefined ? req.body.eyebrowSecondary : prev.eyebrowSecondary
      )
        .trim()
        .slice(0, 80),
      headline: String(req.body.headline !== undefined ? req.body.headline : prev.headline)
        .trim()
        .slice(0, 140),
      subtitle: String(req.body.subtitle !== undefined ? req.body.subtitle : prev.subtitle)
        .trim()
        .slice(0, 420),
      primaryCtaLabel:
        String(
          req.body.primaryCtaLabel !== undefined ? req.body.primaryCtaLabel : prev.primaryCtaLabel
        )
          .trim()
          .slice(0, 40) || DEFAULT_HERO_SETTINGS.primaryCtaLabel,
      secondaryCtaLabel:
        String(
          req.body.secondaryCtaLabel !== undefined
            ? req.body.secondaryCtaLabel
            : prev.secondaryCtaLabel
        )
          .trim()
          .slice(0, 40) || DEFAULT_HERO_SETTINGS.secondaryCtaLabel,
      secondaryCtaHref: rawHref || '#turnamen',
      featuredTournamentId: featuredId,
      backgroundImageUrl: bgCheck.value || '',
      updatedAt: new Date().toISOString(),
    };

    const changedFields = diffChangedFields(prev, nextHero, [
      'eyebrowPrimary',
      'eyebrowSecondary',
      'headline',
      'subtitle',
      'primaryCtaLabel',
      'secondaryCtaLabel',
      'secondaryCtaHref',
      'featuredTournamentId',
      'backgroundImageUrl',
    ]);

    db.heroSettings = nextHero;
    appendAuditLog(db, req, {
      resource: 'HERO',
      action: 'UPDATE',
      targetId: 'hero-settings',
      targetLabel: 'Homepage Hero',
      summary:
        changedFields.length > 0
          ? `Memperbarui konfigurasi Hero (${changedFields.join(', ')})`
          : 'Menyimpan konfigurasi Hero tanpa perubahan field',
      changedFields,
    });
    saveDb(db);
    res.json(nextHero);
  });

  // --- BRAND / LOGO SETTINGS (SUPER ADMIN) ---
  app.put('/api/brand-settings', requireRoles('SUPER_ADMIN'), writeRateLimiter, (req, res) => {
    const db = loadDb();
    const prev: BrandSettings = { ...DEFAULT_BRAND_SETTINGS, ...(db.brandSettings || {}) };

    const wordmarkCheck = sanitizeImageUrl(
      req.body.wordmarkUrl !== undefined ? req.body.wordmarkUrl : prev.wordmarkUrl
    );
    if (!wordmarkCheck.ok) {
      return res.status(400).json({ error: `Logo Wordmark: ${wordmarkCheck.error}` });
    }

    const monogramCheck = sanitizeImageUrl(
      req.body.monogramUrl !== undefined ? req.body.monogramUrl : prev.monogramUrl
    );
    if (!monogramCheck.ok) {
      return res.status(400).json({ error: `Logo Monogram: ${monogramCheck.error}` });
    }

    const faviconCheck = sanitizeImageUrl(
      req.body.faviconUrl !== undefined ? req.body.faviconUrl : prev.faviconUrl
    );
    if (!faviconCheck.ok) {
      return res.status(400).json({ error: `Favicon: ${faviconCheck.error}` });
    }

    const rawBrandName =
      req.body.brandName !== undefined ? String(req.body.brandName).trim().slice(0, 60) : prev.brandName;

    const nextBrand: BrandSettings = {
      wordmarkUrl: wordmarkCheck.value || '',
      monogramUrl: monogramCheck.value || '',
      faviconUrl: faviconCheck.value || '',
      brandName: rawBrandName || DEFAULT_BRAND_SETTINGS.brandName,
      updatedAt: new Date().toISOString(),
    };

    const changedFields = diffChangedFields(prev, nextBrand, [
      'wordmarkUrl',
      'monogramUrl',
      'faviconUrl',
      'brandName',
    ]);

    db.brandSettings = nextBrand;
    appendAuditLog(db, req, {
      resource: 'BRAND',
      action: 'UPDATE',
      targetId: 'brand-settings',
      targetLabel: 'Logo & Brand Website',
      summary:
        changedFields.length > 0
          ? `Memperbarui aset logo & branding website (${changedFields.join(', ')})`
          : 'Menyimpan konfigurasi Logo & Brand tanpa perubahan',
      changedFields,
    });
    saveDb(db);
    res.json(nextBrand);
  });

  app.put('/api/scrim-settings', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const rawDefault = Number(req.body.defaultLobbyFee);
    if (!Number.isFinite(rawDefault) || rawDefault < 0 || rawDefault > 5000000) {
      return res.status(400).json({
        error: 'Default Lobby Fee harus berupa angka antara Rp 0 hingga Rp 5.000.000.',
      });
    }

    const allowedGames: ScrimGame[] = [
      'POINT BLANK',
      'FREE FIRE',
      'EFOOTBALL',
    ];
    const nextByGame: Partial<Record<ScrimGame, number>> = {};
    const rawMap =
      req.body.lobbyFeeByGame && typeof req.body.lobbyFeeByGame === 'object'
        ? (req.body.lobbyFeeByGame as Record<string, unknown>)
        : {};
    for (const g of allowedGames) {
      const val = rawMap[g];
      if (val === undefined || val === null || val === '') continue;
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0 || num > 5000000) {
        return res.status(400).json({
          error: `Lobby Fee untuk ${g} harus antara Rp 0 hingga Rp 5.000.000.`,
        });
      }
      nextByGame[g] = Math.round(num);
    }

    db.scrimSettings = {
      defaultLobbyFee: Math.round(rawDefault),
      lobbyFeeByGame: nextByGame,
      updatedAt: new Date().toISOString(),
    };

    let updatedScrimsCount = 0;
    if (req.body.applyToOpenScrims) {
      const updatableStatuses = new Set(['OPEN_LOBBY', 'WAITING_APPROVAL', 'AWAITING_PAYMENT']);
      db.scrims = db.scrims.map((sc) => {
        if (!updatableStatuses.has(sc.status) || sc.hostPaid || sc.challengerPaid) return sc;
        const fee = getEffectiveLobbyFee(db, sc.game);
        const totalCost = sc.casterRate + fee;
        updatedScrimsCount += 1;
        return {
          ...sc,
          platformFee: fee,
          totalCost,
          splitCostPerTeam: Math.round(totalCost / 2),
        };
      });
    }

    saveDb(db);
    res.json({ scrimSettings: db.scrimSettings, updatedScrimsCount });
  });

  // --- TOURNAMENTS CRUD (SUPER_ADMIN & LEAGUE_OPS ONLY) ---
  app.post('/api/tournaments', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const item: Tournament = {
      id: makeId('trn'),
      name: String(req.body.name || 'TURNAMEN BARU').toUpperCase(),
      game: req.body.game || 'POINT BLANK',
      format: req.body.format || 'SINGLE ELIMINATION',
      prizePool: req.body.prizePool || 'Rp 10.000.000',
      maxTeams: Number(req.body.maxTeams) || 8,
      registeredTeams: Number(req.body.registeredTeams) || 0,
      startDate: req.body.startDate || '2026-12-01 19:00 WIB',
      region: req.body.region || 'ID / SEA',
      status: req.body.status || 'OPEN',
      description: req.body.description || '',
      organizer: String(req.body.organizer || 'ORDAL Esports Hub').trim(),
      registrationFee: String(req.body.registrationFee || 'GRATIS (FREE)').trim(),
      mode: String(req.body.mode || '5v5 · Online').trim(),
      checkInInfo: String(req.body.checkInInfo || '30 Menit Sebelum Kick-Off').trim(),
      prizeFirst: String(req.body.prizeFirst || '').trim() || undefined,
      prizeSecond: String(req.body.prizeSecond || '').trim() || undefined,
      prizeThird: String(req.body.prizeThird || '').trim() || undefined,
      prizeMvp: String(req.body.prizeMvp || '').trim() || undefined,
      rules: String(req.body.rules || '').trim() || undefined,
      liveStreamUrl: (() => {
        const raw = String(req.body.liveStreamUrl || '').trim();
        if (!raw) return undefined;
        try {
          const parsed = new URL(raw);
          return parsed.protocol === 'https:' ? raw : undefined;
        } catch {
          return undefined;
        }
      })(),
      replayStreamUrl: (() => {
        const raw = String(req.body.replayStreamUrl || '').trim();
        if (!raw) return undefined;
        try {
          const parsed = new URL(raw);
          return parsed.protocol === 'https:' ? raw : undefined;
        } catch {
          return undefined;
        }
      })(),
    };
    db.tournaments.unshift(item);
    appendAuditLog(db, req, {
      resource: 'TOURNAMENT',
      action: 'CREATE',
      targetId: item.id,
      targetLabel: item.name,
      summary: `Membuat turnamen baru ${item.name} (${item.game}, ${item.prizePool})`,
    });
    saveDb(db);
    res.status(201).json(item);
  });

  app.put('/api/tournaments/:id', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const idx = db.tournaments.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Turnamen tidak ditemukan' });
    const prev = db.tournaments[idx];
    const nextTournament: Tournament = {
      ...prev,
      ...req.body,
      id: req.params.id,
      maxTeams: Number(req.body.maxTeams ?? prev.maxTeams),
      registeredTeams: Number(req.body.registeredTeams ?? prev.registeredTeams),
      organizer:
        req.body.organizer !== undefined ? String(req.body.organizer || 'ORDAL Esports Hub').trim() : prev.organizer,
      registrationFee:
        req.body.registrationFee !== undefined
          ? String(req.body.registrationFee || 'GRATIS (FREE)').trim()
          : prev.registrationFee,
      mode: req.body.mode !== undefined ? String(req.body.mode || '5v5 · Online').trim() : prev.mode,
      checkInInfo:
        req.body.checkInInfo !== undefined
          ? String(req.body.checkInInfo || '30 Menit Sebelum Kick-Off').trim()
          : prev.checkInInfo,
      prizeFirst:
        req.body.prizeFirst !== undefined ? String(req.body.prizeFirst || '').trim() || undefined : prev.prizeFirst,
      prizeSecond:
        req.body.prizeSecond !== undefined ? String(req.body.prizeSecond || '').trim() || undefined : prev.prizeSecond,
      prizeThird:
        req.body.prizeThird !== undefined ? String(req.body.prizeThird || '').trim() || undefined : prev.prizeThird,
      prizeMvp:
        req.body.prizeMvp !== undefined ? String(req.body.prizeMvp || '').trim() || undefined : prev.prizeMvp,
      rules: req.body.rules !== undefined ? String(req.body.rules || '').trim() || undefined : prev.rules,
      liveStreamUrl:
        req.body.liveStreamUrl !== undefined
          ? (() => {
              const raw = String(req.body.liveStreamUrl || '').trim();
              if (!raw) return undefined;
              try {
                const parsed = new URL(raw);
                return parsed.protocol === 'https:' ? raw : prev.liveStreamUrl;
              } catch {
                return prev.liveStreamUrl;
              }
            })()
          : prev.liveStreamUrl,
      replayStreamUrl:
        req.body.replayStreamUrl !== undefined
          ? (() => {
              const raw = String(req.body.replayStreamUrl || '').trim();
              if (!raw) return undefined;
              try {
                const parsed = new URL(raw);
                return parsed.protocol === 'https:' ? raw : prev.replayStreamUrl;
              } catch {
                return prev.replayStreamUrl;
              }
            })()
          : prev.replayStreamUrl,
    };
    const changedFields = diffChangedFields(prev, nextTournament, [
      'name',
      'game',
      'format',
      'prizePool',
      'maxTeams',
      'registeredTeams',
      'startDate',
      'region',
      'status',
      'description',
      'organizer',
      'registrationFee',
      'mode',
      'checkInInfo',
      'prizeFirst',
      'prizeSecond',
      'prizeThird',
      'prizeMvp',
      'rules',
      'liveStreamUrl',
      'replayStreamUrl',
    ]);
    db.tournaments[idx] = nextTournament;
    appendAuditLog(db, req, {
      resource: 'TOURNAMENT',
      action: 'UPDATE',
      targetId: nextTournament.id,
      targetLabel: nextTournament.name,
      summary:
        changedFields.length > 0
          ? `Mengubah data turnamen ${nextTournament.name} (${changedFields.join(', ')})`
          : `Menyimpan turnamen ${nextTournament.name}`,
      changedFields,
    });
    saveDb(db);
    res.json(db.tournaments[idx]);
  });

  app.delete('/api/tournaments/:id', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const target = db.tournaments.find((t) => t.id === req.params.id);
    db.tournaments = db.tournaments.filter((t) => t.id !== req.params.id);
    db.matches = db.matches.filter((m) => m.tournamentId !== req.params.id);
    if (target) {
      appendAuditLog(db, req, {
        resource: 'TOURNAMENT',
        action: 'DELETE',
        targetId: target.id,
        targetLabel: target.name,
        summary: `Menghapus turnamen ${target.name} (${target.game}) beserta match terkait`,
      });
    }
    saveDb(db);
    res.json({ deleted: true });
  });

  // Auto-seed bracket for a tournament from registered squads
  app.post('/api/tournaments/:id/generate-bracket', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const trn = db.tournaments.find((t) => t.id === req.params.id);
    if (!trn) return res.status(404).json({ error: 'Turnamen tidak ditemukan' });

    const trnSquads = db.squads
      .filter((s) => s.tournamentId === trn.id && s.checkInStatus !== 'DISQUALIFIED')
      .sort((a, b) => a.seed - b.seed);

    const padded: { name: string; tag: string }[] = [];
    for (let i = 0; i < 8; i++) {
      if (trnSquads[i]) {
        padded.push({ name: trnSquads[i].name, tag: trnSquads[i].tag });
      } else {
        padded.push({ name: `QUALIFIER #${i + 1}`, tag: `Q${i + 1}` });
      }
    }

    // Remove previous matches for this tournament
    db.matches = db.matches.filter((m) => m.tournamentId !== trn.id);

    const now = new Date().toISOString();
    const gfId = makeId('mch-gf');
    const sf1Id = makeId('mch-sf1');
    const sf2Id = makeId('mch-sf2');

    const newMatches: Match[] = [
      {
        id: makeId('mch-qf1'),
        tournamentId: trn.id,
        game: trn.game,
        round: 'QUARTERFINAL',
        bracketOrder: 1,
        teamA: padded[0].name,
        teamATag: padded[0].tag,
        teamB: padded[7].name,
        teamBTag: padded[7].tag,
        scoreA: 0,
        scoreB: 0,
        mapName: 'TBD',
        status: 'UPCOMING',
        nextMatchId: sf1Id,
        nextMatchSlot: 'A',
        updatedAt: now,
      },
      {
        id: makeId('mch-qf2'),
        tournamentId: trn.id,
        game: trn.game,
        round: 'QUARTERFINAL',
        bracketOrder: 2,
        teamA: padded[3].name,
        teamATag: padded[3].tag,
        teamB: padded[4].name,
        teamBTag: padded[4].tag,
        scoreA: 0,
        scoreB: 0,
        mapName: 'TBD',
        status: 'UPCOMING',
        nextMatchId: sf1Id,
        nextMatchSlot: 'B',
        updatedAt: now,
      },
      {
        id: makeId('mch-qf3'),
        tournamentId: trn.id,
        game: trn.game,
        round: 'QUARTERFINAL',
        bracketOrder: 3,
        teamA: padded[1].name,
        teamATag: padded[1].tag,
        teamB: padded[6].name,
        teamBTag: padded[6].tag,
        scoreA: 0,
        scoreB: 0,
        mapName: 'TBD',
        status: 'UPCOMING',
        nextMatchId: sf2Id,
        nextMatchSlot: 'A',
        updatedAt: now,
      },
      {
        id: makeId('mch-qf4'),
        tournamentId: trn.id,
        game: trn.game,
        round: 'QUARTERFINAL',
        bracketOrder: 4,
        teamA: padded[2].name,
        teamATag: padded[2].tag,
        teamB: padded[5].name,
        teamBTag: padded[5].tag,
        scoreA: 0,
        scoreB: 0,
        mapName: 'TBD',
        status: 'UPCOMING',
        nextMatchId: sf2Id,
        nextMatchSlot: 'B',
        updatedAt: now,
      },
      {
        id: sf1Id,
        tournamentId: trn.id,
        game: trn.game,
        round: 'SEMIFINAL',
        bracketOrder: 1,
        teamA: 'TBD',
        teamATag: 'TBD',
        teamB: 'TBD',
        teamBTag: 'TBD',
        scoreA: 0,
        scoreB: 0,
        mapName: 'TBD',
        status: 'UPCOMING',
        nextMatchId: gfId,
        nextMatchSlot: 'A',
        updatedAt: now,
      },
      {
        id: sf2Id,
        tournamentId: trn.id,
        game: trn.game,
        round: 'SEMIFINAL',
        bracketOrder: 2,
        teamA: 'TBD',
        teamATag: 'TBD',
        teamB: 'TBD',
        teamBTag: 'TBD',
        scoreA: 0,
        scoreB: 0,
        mapName: 'TBD',
        status: 'UPCOMING',
        nextMatchId: gfId,
        nextMatchSlot: 'B',
        updatedAt: now,
      },
      {
        id: gfId,
        tournamentId: trn.id,
        game: trn.game,
        round: 'GRAND FINAL',
        bracketOrder: 1,
        teamA: 'TBD',
        teamATag: 'TBD',
        teamB: 'TBD',
        teamBTag: 'TBD',
        scoreA: 0,
        scoreB: 0,
        mapName: 'BO3',
        status: 'UPCOMING',
        updatedAt: now,
      },
    ];

    db.matches.push(...newMatches);
    trn.status = 'ONGOING';
    appendAuditLog(db, req, {
      resource: 'TOURNAMENT',
      action: 'GENERATE_BRACKET',
      targetId: trn.id,
      targetLabel: trn.name,
      summary: `Generate bracket otomatis (${newMatches.length} match) & set status ONGOING untuk ${trn.name}`,
      changedFields: ['status', 'matches'],
    });
    saveDb(db);
    res.json({ matches: newMatches });
  });

  // --- MATCHES CRUD (SUPER_ADMIN & LEAGUE_OPS ONLY) ---
  app.post('/api/matches', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const item: Match = {
      id: makeId('mch'),
      tournamentId: req.body.tournamentId || db.tournaments[0]?.id || 'trn-001',
      game: req.body.game || 'POINT BLANK',
      round: req.body.round || 'QUARTERFINAL',
      bracketOrder: Number(req.body.bracketOrder) || 1,
      teamA: String(req.body.teamA || 'TEAM A').toUpperCase(),
      teamATag: String(req.body.teamATag || 'TMA').toUpperCase(),
      teamB: String(req.body.teamB || 'TEAM B').toUpperCase(),
      teamBTag: String(req.body.teamBTag || 'TMB').toUpperCase(),
      scoreA: Number(req.body.scoreA) || 0,
      scoreB: Number(req.body.scoreB) || 0,
      mapName: String(req.body.mapName || 'DOWNTOWN').toUpperCase(),
      status: req.body.status || 'UPCOMING',
      winnerTag: req.body.winnerTag || undefined,
      nextMatchId: req.body.nextMatchId || undefined,
      nextMatchSlot: req.body.nextMatchSlot || undefined,
      mvpIgn: req.body.mvpIgn || undefined,
      updatedAt: new Date().toISOString(),
    };
    db.matches.push(item);
    appendAuditLog(db, req, {
      resource: 'MATCH',
      action: 'CREATE',
      targetId: item.id,
      targetLabel: `${item.teamATag} vs ${item.teamBTag}`,
      summary: `Menambahkan match ${item.round}: ${item.teamA} [${item.teamATag}] vs ${item.teamB} [${item.teamBTag}]`,
    });
    saveDb(db);
    res.status(201).json(item);
  });

  app.put('/api/matches/:id', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const idx = db.matches.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Match tidak ditemukan' });

    const existing = db.matches[idx];
    const updated: Match = {
      ...existing,
      ...req.body,
      id: req.params.id,
      scoreA: Number(req.body.scoreA ?? existing.scoreA),
      scoreB: Number(req.body.scoreB ?? existing.scoreB),
      updatedAt: new Date().toISOString(),
    };

    // Determine winner automatically when status is FINISHED
    if (updated.status === 'FINISHED') {
      if (updated.scoreA > updated.scoreB) {
        updated.winnerTag = updated.teamATag;
      } else if (updated.scoreB > updated.scoreA) {
        updated.winnerTag = updated.teamBTag;
      }
    } else {
      updated.winnerTag = undefined;
    }

    const changedFields = diffChangedFields(existing, updated, [
      'scoreA',
      'scoreB',
      'status',
      'mapName',
      'mvpIgn',
      'winnerTag',
      'teamA',
      'teamB',
    ]);
    db.matches[idx] = updated;

    // Auto-advance winner to next bracket node
    if (updated.status === 'FINISHED' && updated.winnerTag && updated.nextMatchId && updated.nextMatchSlot) {
      const nextIdx = db.matches.findIndex((m) => m.id === updated.nextMatchId);
      if (nextIdx !== -1) {
        const winnerName = updated.winnerTag === updated.teamATag ? updated.teamA : updated.teamB;
        if (updated.nextMatchSlot === 'A') {
          db.matches[nextIdx].teamA = winnerName;
          db.matches[nextIdx].teamATag = updated.winnerTag;
        } else {
          db.matches[nextIdx].teamB = winnerName;
          db.matches[nextIdx].teamBTag = updated.winnerTag;
        }
      }
    }

    appendAuditLog(db, req, {
      resource: 'MATCH',
      action: 'UPDATE',
      targetId: updated.id,
      targetLabel: `${updated.teamATag} ${updated.scoreA}-${updated.scoreB} ${updated.teamBTag}`,
      summary: `Memperbarui match ${updated.round} (${updated.teamATag} vs ${updated.teamBTag}) · Status: ${updated.status}`,
      changedFields,
    });
    saveDb(db);
    res.json(updated);
  });

  app.delete('/api/matches/:id', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const target = db.matches.find((m) => m.id === req.params.id);
    db.matches = db.matches.filter((m) => m.id !== req.params.id);
    if (target) {
      appendAuditLog(db, req, {
        resource: 'MATCH',
        action: 'DELETE',
        targetId: target.id,
        targetLabel: `${target.teamATag} vs ${target.teamBTag}`,
        summary: `Menghapus match ${target.round} (${target.teamATag} vs ${target.teamBTag})`,
      });
    }
    saveDb(db);
    res.json({ deleted: true });
  });

  // --- SQUADS / ROSTER CRUD ---
  app.post('/api/squads', writeRateLimiter, async (req, res) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (authUser?.role !== 'SUPER_ADMIN' && authUser?.role !== 'LEAGUE_OPS') {
        const captchaCheck = await verifyTurnstileIfConfigured(req);
        if (!captchaCheck.ok) {
          return res.status(captchaCheck.status || 400).json({ error: captchaCheck.error });
        }
      }

      const db = loadDb();
      const tournamentId = req.body.tournamentId || db.tournaments[0]?.id || 'trn-001';
      const trn = db.tournaments.find((t) => t.id === tournamentId);
      if (!trn) {
        return res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      }
      if (trn.status !== 'OPEN') {
        return res.status(400).json({
          error: `Pendaftaran turnamen ${trn.name} sudah ditutup (status: ${trn.status}).`,
        });
      }
      if (trn.registeredTeams >= trn.maxTeams) {
        return res.status(400).json({
          error: `Kuota peserta turnamen ${trn.name} sudah penuh.`,
        });
      }
      if (authUser?.role === 'CASTER') {
      return res.status(403).json({
        error: 'Akun Shoutcaster tidak dapat mendaftar sebagai peserta turnamen.',
      });
    }
    if (
      authUser?.role === 'TEAM' &&
      authUser.teamProfile?.primaryGame &&
      authUser.teamProfile.primaryGame !== trn.game
    ) {
      return res.status(403).json({
        error: `Akun tim Anda terdaftar di cabang ${authUser.teamProfile.primaryGame}, tidak dapat mendaftar turnamen ${trn.game}. Ubah Game Utama di Team Portal jika ingin mendaftar cabang ini.`,
      });
    }

    const reqNameUpper = String(req.body.name || 'NEW SQUAD').trim().toUpperCase();
    const reqTagUpper = String(req.body.tag || 'SQD').trim().toUpperCase().slice(0, 5);
    const duplicateSquad = db.squads.find(
      (s) =>
        s.tournamentId === tournamentId &&
        (s.name.trim().toUpperCase() === reqNameUpper ||
          s.tag.trim().toUpperCase() === reqTagUpper)
    );
    if (duplicateSquad) {
      return res.status(409).json({
        error: `Squad ${duplicateSquad.name} [${duplicateSquad.tag}] sudah terdaftar di turnamen ${trn.name}.`,
      });
    }

    const currentCount = db.squads.filter((s) => s.tournamentId === tournamentId).length;
    const rosterArray = Array.isArray(req.body.roster)
      ? req.body.roster.map((r: string) => r.trim()).filter(Boolean)
      : String(req.body.roster || '')
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);

    const item: Squad = {
      id: makeId('sqd'),
      name: reqNameUpper,
      tag: reqTagUpper,
      tournamentId,
      captainIgn: req.body.captainIgn || rosterArray[0] || 'Captain#ID',
      captainContact: req.body.captainContact || '',
      roster: rosterArray.length > 0 ? rosterArray : ['Player1#ID'],
      seed: Number(req.body.seed) || currentCount + 1,
      checkInStatus: req.body.checkInStatus || 'PENDING',
      registeredAt: new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    db.squads.unshift(item);

    // Increment registeredTeams on tournament
    if (trn.registeredTeams < trn.maxTeams) {
      trn.registeredTeams += 1;
    }

    appendAuditLog(db, req, {
      resource: 'SQUAD',
      action: 'CREATE',
      targetId: item.id,
      targetLabel: `${item.name} [${item.tag}]`,
      summary: `Menambahkan squad ${item.name} [${item.tag}] ke turnamen ${trn?.name || tournamentId}`,
    });

    saveDb(db);
    res.status(201).json(item);
    } catch {
      res.status(500).json({ error: 'Gagal mendaftarkan squad.' });
    }
  });

  app.put('/api/squads/:id', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const idx = db.squads.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Squad tidak ditemukan' });

    const prev = db.squads[idx];
    let roster = prev.roster;
    if (req.body.roster !== undefined) {
      roster = Array.isArray(req.body.roster)
        ? req.body.roster
        : String(req.body.roster)
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean);
    }

    const nextSquad: Squad = {
      ...prev,
      ...req.body,
      roster,
      id: req.params.id,
      seed: Number(req.body.seed ?? prev.seed),
    };
    const changedFields = diffChangedFields(prev, nextSquad, [
      'name',
      'tag',
      'tournamentId',
      'captainIgn',
      'captainContact',
      'roster',
      'seed',
      'checkInStatus',
    ]);
    db.squads[idx] = nextSquad;
    appendAuditLog(db, req, {
      resource: 'SQUAD',
      action: 'UPDATE',
      targetId: nextSquad.id,
      targetLabel: `${nextSquad.name} [${nextSquad.tag}]`,
      summary:
        changedFields.length > 0
          ? `Mengubah data squad ${nextSquad.name} (${changedFields.join(', ')})`
          : `Menyimpan data squad ${nextSquad.name}`,
      changedFields,
    });
    saveDb(db);
    res.json(db.squads[idx]);
  });

  app.delete('/api/squads/:id', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const db = loadDb();
    const target = db.squads.find((s) => s.id === req.params.id);
    if (target) {
      const trn = db.tournaments.find((t) => t.id === target.tournamentId);
      if (trn && trn.registeredTeams > 0) trn.registeredTeams -= 1;
      appendAuditLog(db, req, {
        resource: 'SQUAD',
        action: 'DELETE',
        targetId: target.id,
        targetLabel: `${target.name} [${target.tag}]`,
        summary: `Menghapus squad ${target.name} [${target.tag}] dari turnamen ${trn?.name || target.tournamentId}`,
      });
    }
    db.squads = db.squads.filter((s) => s.id !== req.params.id);
    saveDb(db);
    res.json({ deleted: true });
  });

  // --- NEWS CRUD ---
  app.post('/api/news', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const thumbCheck = sanitizeImageUrl(req.body.thumbnailUrl);
    if (!thumbCheck.ok) {
      return res.status(400).json({ error: thumbCheck.error });
    }
    const item: NewsArticle = {
      id: makeId('nws'),
      title: String(req.body.title || 'ARTIKEL BARU').toUpperCase(),
      category: req.body.category || 'META UPDATE',
      author: req.body.author || 'Redaksi ORDAL',
      publishedAt:
        req.body.publishedAt ||
        new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      readTime: req.body.readTime || '4 MIN READ',
      excerpt: req.body.excerpt || '',
      content: req.body.content || '',
      accentTone: req.body.accentTone || 'lime',
      thumbnailUrl: thumbCheck.value,
    };
    db.news.unshift(item);
    saveDb(db);
    res.status(201).json(item);
  });

  app.put('/api/news/:id', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const idx = db.news.findIndex((n) => n.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Artikel tidak ditemukan' });
    const thumbCheck =
      req.body.thumbnailUrl !== undefined
        ? sanitizeImageUrl(req.body.thumbnailUrl)
        : { ok: true, value: db.news[idx].thumbnailUrl };
    if (!thumbCheck.ok) {
      return res.status(400).json({ error: thumbCheck.error });
    }
    db.news[idx] = {
      ...db.news[idx],
      ...req.body,
      id: req.params.id,
      thumbnailUrl: thumbCheck.value,
    };
    saveDb(db);
    res.json(db.news[idx]);
  });

  app.delete('/api/news/:id', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    db.news = db.news.filter((n) => n.id !== req.params.id);
    saveDb(db);
    res.json({ deleted: true });
  });

  // --- SCRIM ALL GAME CRUD & STATE MACHINE ---
  app.post('/api/scrims', writeRateLimiter, requireRoles('TEAM', 'SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const scrimDate = String(req.body.date || '2026-11-25');
    const scrimTimeSlot = String(req.body.timeSlot || '20:00 WIB');
    const requestedCasterId = String(req.body.casterId || 'none');
    const caster =
      requestedCasterId !== 'none'
        ? db.casters.find((c) => c.id === requestedCasterId) ||
          db.casters.find((c) => c.name === req.body.casterName)
        : undefined;

    if (caster) {
      if (caster.dayOffDates.includes(scrimDate)) {
        return res.status(400).json({
          error: `${caster.name} sedang FULL DAY OFF pada tanggal ${scrimDate}. Pilih caster atau tanggal lain.`,
        });
      }
      const blockedSlotsOnDate = caster.dayOffSlots?.[scrimDate] || [];
      if (blockedSlotsOnDate.includes(scrimTimeSlot)) {
        return res.status(400).json({
          error: `${caster.name} sedang DAY OFF pada ${scrimDate} jam ${scrimTimeSlot}. Pilih slot jam atau caster lain.`,
        });
      }
      const slotConflict = db.scrims.find(
        (s) =>
          s.casterId === caster.id &&
          s.date === scrimDate &&
          s.timeSlot === scrimTimeSlot &&
          s.status !== 'CANCELLED' &&
          s.casterApprovalStatus !== 'REJECTED'
      );
      if (slotConflict) {
        return res.status(400).json({
          error: `BENTROK JADWAL: ${caster.name} sudah terjadwal pada ${scrimDate} jam ${scrimTimeSlot} (${slotConflict.hostTeamName}). Pilih slot jam atau caster lain.`,
        });
      }
      const dailyCount = db.scrims.filter(
        (s) =>
          s.casterId === caster.id &&
          s.date === scrimDate &&
          s.status !== 'CANCELLED' &&
          s.casterApprovalStatus !== 'REJECTED'
      ).length;
      const baseLimit = caster.maxMatchesPerDay || 2;
      const limit = blockedSlotsOnDate.length > 0 ? Math.max(1, baseLimit - 1) : baseLimit;
      if (dailyCount >= limit) {
        return res.status(400).json({
          error:
            blockedSlotsOnDate.length > 0
              ? `${caster.name} sudah FULL BOOK (${dailyCount}/${limit} match · mode 1 Job / 1 Off) pada tanggal ${scrimDate}.`
              : `${caster.name} sudah FULL BOOK (${dailyCount}/${limit} match) pada tanggal ${scrimDate}.`,
        });
      }
    }

    const casterRate = caster ? caster.rateCard : 0;
    const rawScrimGame = String(req.body.game || 'POINT BLANK').toUpperCase();
    const validScrimGames: ScrimGame[] = ['POINT BLANK', 'FREE FIRE', 'EFOOTBALL'];
    if (!validScrimGames.includes(rawScrimGame as ScrimGame)) {
      return res.status(400).json({
        error: 'Cabang game tidak didukung. Pilih Point Blank, Free Fire, atau eFootball.',
      });
    }
    const scrimGame: ScrimGame = rawScrimGame as ScrimGame;
    const authUser = getAuthenticatedUser(req);
    if (
      authUser?.role === 'TEAM' &&
      authUser.teamProfile?.primaryGame &&
      authUser.teamProfile.primaryGame !== scrimGame
    ) {
      return res.status(403).json({
        error: `Akun tim Anda terdaftar di cabang ${authUser.teamProfile.primaryGame}. Anda hanya dapat membuat jadwal scrim ${authUser.teamProfile.primaryGame}.`,
      });
    }
    if (caster && !caster.specialtyGames.includes(scrimGame)) {
      return res.status(400).json({
        error: `Shoutcaster ${caster.name} tidak memiliki spesialisasi di cabang ${scrimGame}. Pilih caster lain.`,
      });
    }
    const mode = req.body.mode === 'DIRECT_CHALLENGE' ? 'DIRECT_CHALLENGE' : 'OPEN_LOBBY';
    if (mode === 'DIRECT_CHALLENGE') {
      const targetName = String(req.body.challengerTeamName || '').trim().toUpperCase();
      if (!targetName) {
        return res.status(400).json({ error: 'Nama tim lawan wajib diisi untuk mode Tantang Langsung.' });
      }
      const authStore = loadAuthStore();
      const matchedOpponent = authStore.users.find(
        (u) =>
          u.role === 'TEAM' &&
          (u.teamProfile?.teamName?.trim().toUpperCase() === targetName ||
            u.displayName.trim().toUpperCase() === targetName)
      );
      if (
        matchedOpponent?.teamProfile?.primaryGame &&
        matchedOpponent.teamProfile.primaryGame !== scrimGame
      ) {
        return res.status(400).json({
          error: `Tim lawan ${targetName} terdaftar di cabang ${matchedOpponent.teamProfile.primaryGame}, tidak sesuai dengan jadwal scrim ${scrimGame}.`,
        });
      }
    }
    const platformFee = getEffectiveLobbyFee(db, scrimGame);
    const totalCost = casterRate + platformFee;
    const splitCostPerTeam = Math.round(totalCost / 2);

    const parseList = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
      return String(val || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    };

    const hostLogoCheck = sanitizeImageUrl(req.body.hostTeamLogo);
    if (!hostLogoCheck.ok) {
      return res.status(400).json({ error: `Logo Tim Host: ${hostLogoCheck.error}` });
    }
    const challLogoCheck =
      mode === 'DIRECT_CHALLENGE'
        ? sanitizeImageUrl(req.body.challengerTeamLogo)
        : { ok: true, value: '' };
    if (!challLogoCheck.ok) {
      return res.status(400).json({ error: `Logo Tim Penantang: ${challLogoCheck.error}` });
    }

    const item: ScrimSession = {
      id: makeId('scr'),
      game: req.body.game || 'POINT BLANK',
      date: scrimDate,
      timeSlot: req.body.timeSlot || '20:00 WIB',
      mode,
      status: mode === 'DIRECT_CHALLENGE' ? 'WAITING_APPROVAL' : 'OPEN_LOBBY',
      casterId: caster ? caster.id : 'none',
      casterName: caster ? caster.name : 'Tanpa Caster (Self-Hosted)',
      casterRate,
      casterApprovalStatus: caster ? 'PENDING' : 'NOT_REQUIRED',
      platformFee,
      totalCost,
      splitCostPerTeam,
      hostUserId: authUser?.role === 'TEAM' ? authUser.id : undefined,
      hostUserEmail: authUser?.role === 'TEAM' ? authUser.email : undefined,
      hostTeamName: String(req.body.hostTeamName || 'HOST TEAM').toUpperCase(),
      hostTeamLogo: hostLogoCheck.value || '',
      hostRosterCore: parseList(req.body.hostRosterCore),
      hostRosterSub: parseList(req.body.hostRosterSub),
      challengerTeamName:
        mode === 'DIRECT_CHALLENGE'
          ? String(req.body.challengerTeamName || 'CHALLENGER TEAM').toUpperCase()
          : '',
      challengerTeamLogo: mode === 'DIRECT_CHALLENGE' ? challLogoCheck.value || '' : '',
      challengerRosterCore:
        mode === 'DIRECT_CHALLENGE' ? parseList(req.body.challengerRosterCore) : [],
      challengerRosterSub:
        mode === 'DIRECT_CHALLENGE' ? parseList(req.body.challengerRosterSub) : [],
      challengerApplications: [],
      hostPaid: false,
      challengerPaid: false,
      createdAt: new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    db.scrims.unshift(item);
    saveDb(db);
    res.status(201).json(sanitizeScrimForRole(item, authUser));
  });

  const isHostTeamUser = (scrim: ScrimSession, user: StoredUser | null): boolean =>
    isScrimHostUser(scrim, user);

  // Team (other than host): submit scrim challenge application for an OPEN_LOBBY scrim
  app.post('/api/scrims/:id/challenge', requireRoles('TEAM'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Silakan login sebagai akun Tim.' });

    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });

    if (scrim.status !== 'OPEN_LOBBY') {
      return res.status(400).json({
        error: 'Sesi scrim ini sudah tidak membuka pendaftaran penantang (bukan Open Lobby).',
      });
    }

    if (isHostTeamUser(scrim, authUser)) {
      return res.status(403).json({
        error:
          'Anda tidak dapat mengajukan scrim pada lobby milik tim Anda sendiri. Hanya akun tim lain yang dapat menantang.',
      });
    }

    if (
      authUser.teamProfile?.primaryGame &&
      authUser.teamProfile.primaryGame !== scrim.game
    ) {
      return res.status(403).json({
        error: `Akun tim Anda terdaftar di cabang ${authUser.teamProfile.primaryGame}, tidak dapat mengajukan scrim untuk lobby ${scrim.game}.`,
      });
    }

    if (!Array.isArray(scrim.challengerApplications)) {
      scrim.challengerApplications = [];
    }

    const alreadyApplied = scrim.challengerApplications.find(
      (a) =>
        (a.applicantUserId === authUser.id ||
          a.applicantEmail.toLowerCase() === authUser.email.toLowerCase()) &&
        a.status !== 'REJECTED'
    );
    if (alreadyApplied) {
      return res.status(400).json({
        error: 'Tim Anda sudah mengajukan tantangan pada lobby ini. Tunggu pilihan Team Leader host.',
      });
    }

    const challengerTeamName = String(
      req.body.challengerTeamName || authUser.teamProfile?.teamName || authUser.displayName || 'CHALLENGER'
    )
      .trim()
      .toUpperCase();
    if (!challengerTeamName) {
      return res.status(400).json({ error: 'Nama tim penantang wajib diisi.' });
    }
    if (challengerTeamName.toLowerCase() === scrim.hostTeamName.trim().toLowerCase()) {
      return res.status(400).json({
        error: 'Nama tim penantang tidak boleh sama dengan tim host.',
      });
    }

    const challengerRosterCore = Array.isArray(req.body.challengerRosterCore)
      ? req.body.challengerRosterCore.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];
    const challengerRosterSub = Array.isArray(req.body.challengerRosterSub)
      ? req.body.challengerRosterSub.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];
    const note = String(req.body.note || '').trim().slice(0, 200);

    const appLogoCheck = sanitizeImageUrl(req.body.challengerTeamLogo ?? authUser.teamProfile?.teamLogo);
    if (!appLogoCheck.ok) {
      return res.status(400).json({ error: `Logo Tim Penantang: ${appLogoCheck.error}` });
    }

    scrim.challengerApplications.push({
      id: makeId('app'),
      teamName: challengerTeamName,
      teamLogo: appLogoCheck.value || '',
      rosterCore: challengerRosterCore,
      rosterSub: challengerRosterSub,
      applicantUserId: authUser.id,
      applicantEmail: authUser.email,
      note: note || undefined,
      status: 'PENDING',
      appliedAt: new Date().toISOString(),
    });

    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  // Host Team Leader: choose (or reject) a challenger team in OPEN_LOBBY
  app.post('/api/scrims/:id/select-challenger', requireRoles('TEAM'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Silakan login sebagai akun Tim.' });

    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });

    if (!isHostTeamUser(scrim, authUser)) {
      return res.status(403).json({
        error: 'Hanya Team Leader pembuat Open Lobby yang dapat memilih lawan.',
      });
    }

    if (scrim.status !== 'OPEN_LOBBY') {
      return res.status(400).json({
        error: 'Lawan sudah ditentukan atau lobby tidak lagi berstatus Open Lobby.',
      });
    }

    const applicationId = String(req.body.applicationId || '').trim();
    const action = req.body.action === 'REJECT' ? 'REJECT' : 'SELECT';
    const apps = Array.isArray(scrim.challengerApplications) ? scrim.challengerApplications : [];
    const target = apps.find((a) => a.id === applicationId);

    if (!target || target.status !== 'PENDING') {
      return res.status(404).json({
        error: 'Pengajuan tim penantang tidak ditemukan atau sudah diproses.',
      });
    }

    if (action === 'REJECT') {
      target.status = 'REJECTED';
      saveDb(db);
      return res.json(scrim);
    }

    // SELECT: lock chosen opponent and mark other pending applicants as REJECTED
    for (const appItem of apps) {
      if (appItem.id === target.id) {
        appItem.status = 'SELECTED';
      } else if (appItem.status === 'PENDING') {
        appItem.status = 'REJECTED';
      }
    }

    scrim.challengerUserId = target.applicantUserId;
    scrim.challengerUserEmail = target.applicantEmail;
    scrim.challengerTeamName = target.teamName;
    scrim.challengerTeamLogo = target.teamLogo;
    scrim.challengerRosterCore = target.rosterCore;
    scrim.challengerRosterSub = target.rosterSub;

    if (scrim.casterId && scrim.casterId !== 'none') {
      scrim.status = 'WAITING_APPROVAL';
    } else {
      scrim.status = 'AWAITING_PAYMENT';
      scrim.paymentDeadlineAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }

    ensurePaymentRecords(db);
    saveDb(db);
    res.json(scrim);
  });

  app.post('/api/scrims/:id/approve', requireRoles('CASTER'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });
    if (
      authUser?.casterId &&
      scrim.casterId &&
      scrim.casterId !== 'none' &&
      scrim.casterId !== authUser.casterId
    ) {
      return res.status(403).json({
        error: 'Hanya caster yang ditugaskan pada scrim ini yang dapat melakukan approval.',
      });
    }
    scrim.casterApprovalStatus = 'APPROVED';
    scrim.status = 'AWAITING_PAYMENT';
    scrim.hostPaid = false;
    scrim.challengerPaid = false;
    scrim.paymentDeadlineAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    ensurePaymentRecords(db);
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  app.post('/api/scrims/:id/reject', requireRoles('CASTER'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });
    if (
      authUser?.casterId &&
      scrim.casterId &&
      scrim.casterId !== 'none' &&
      scrim.casterId !== authUser.casterId
    ) {
      return res.status(403).json({
        error: 'Hanya caster yang ditugaskan pada scrim ini yang dapat menolak scrim.',
      });
    }
    scrim.casterApprovalStatus = 'REJECTED';
    scrim.status = 'CANCELLED';
    scrim.paymentDeadlineAt = undefined;
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  // Caster: propose reschedule for an assigned scrim
  app.post('/api/scrims/:id/reschedule', requireRoles('CASTER'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });
    if (
      authUser?.casterId &&
      scrim.casterId &&
      scrim.casterId !== 'none' &&
      scrim.casterId !== authUser.casterId
    ) {
      return res.status(403).json({
        error: 'Anda hanya dapat mengajukan reschedule pada scrim yang ditugaskan kepada Anda.',
      });
    }
    if (scrim.status === 'CANCELLED' || scrim.casterApprovalStatus === 'REJECTED') {
      return res.status(400).json({ error: 'Scrim yang sudah ditolak tidak dapat di-reschedule.' });
    }

    const proposedDate = String(req.body.proposedDate || '').trim();
    const proposedTimeSlot = String(req.body.proposedTimeSlot || '').trim();
    const reason = String(req.body.reason || '').trim().slice(0, 240);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate) || !proposedTimeSlot) {
      return res.status(400).json({ error: 'Tanggal dan jam usulan reschedule wajib diisi.' });
    }

    const caster = db.casters.find((c) => c.id === scrim.casterId);
    if (caster?.dayOffDates.includes(proposedDate)) {
      return res.status(400).json({
        error: `Tanggal ${proposedDate} tercatat sebagai Full Day Off Anda. Pilih tanggal lain.`,
      });
    }
    const proposedBlockedSlots = caster?.dayOffSlots?.[proposedDate] || [];
    if (proposedBlockedSlots.includes(proposedTimeSlot)) {
      return res.status(400).json({
        error: `Jam ${proposedTimeSlot} pada ${proposedDate} tercatat sebagai Day Off Anda. Pilih slot jam lain.`,
      });
    }
    const slotConflict = db.scrims.find(
      (s) =>
        s.id !== scrim.id &&
        s.casterId === scrim.casterId &&
        s.date === proposedDate &&
        s.timeSlot === proposedTimeSlot &&
        s.status !== 'CANCELLED' &&
        s.casterApprovalStatus !== 'REJECTED'
    );
    if (slotConflict) {
      return res.status(400).json({
        error: `Jadwal bentrok pada ${proposedDate} ${proposedTimeSlot} (${slotConflict.hostTeamName}).`,
      });
    }

    scrim.rescheduleProposal = {
      proposedDate,
      proposedTimeSlot,
      reason: reason || undefined,
      proposedBy: authUser?.displayName || scrim.casterName,
      proposedAt: new Date().toISOString(),
      status: 'PENDING',
    };
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  // Team: accept or decline caster's reschedule proposal (participant teams only)
  app.post('/api/scrims/:id/reschedule-response', requireRoles('TEAM'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Silakan login sebagai akun Tim.' });

    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });

    if (!isScrimHostUser(scrim, authUser) && !isScrimChallengerUser(scrim, authUser)) {
      recordSocEvent({
        severity: 'HIGH',
        category: 'RBAC_VIOLATION',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        actorEmail: authUser.email,
        actorRole: authUser.role,
        summary: `Percobaan respon reschedule scrim tim lain (${scrim.id}) oleh ${authUser.email}.`,
      });
      return res.status(403).json({
        error: 'Hanya tim Host atau Challenger yang terlibat dalam scrim ini yang dapat merespons reschedule.',
      });
    }

    if (!scrim.rescheduleProposal || scrim.rescheduleProposal.status !== 'PENDING') {
      return res.status(400).json({ error: 'Tidak ada pengajuan reschedule yang menunggu respons.' });
    }
    const decision = req.body.decision === 'DECLINED' ? 'DECLINED' : 'ACCEPTED';
    scrim.rescheduleProposal.status = decision;
    if (decision === 'ACCEPTED') {
      scrim.date = scrim.rescheduleProposal.proposedDate;
      scrim.timeSlot = scrim.rescheduleProposal.proposedTimeSlot;
    }
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  // Team: request refund when scrim is rejected/cancelled (participant teams only)
  app.post('/api/scrims/:id/refund', requireRoles('TEAM'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Silakan login sebagai akun Tim.' });

    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });

    const isHost = isScrimHostUser(scrim, authUser);
    const isChallenger = isScrimChallengerUser(scrim, authUser);
    if (!isHost && !isChallenger) {
      recordSocEvent({
        severity: 'HIGH',
        category: 'RBAC_VIOLATION',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        actorEmail: authUser.email,
        actorRole: authUser.role,
        summary: `Percobaan pengajuan refund scrim tim lain (${scrim.id}) oleh ${authUser.email}.`,
      });
      return res.status(403).json({
        error: 'Anda hanya dapat mengajukan refund untuk sesi scrim yang diikuti oleh tim Anda.',
      });
    }

    const isRejected = scrim.status === 'CANCELLED' || scrim.casterApprovalStatus === 'REJECTED';
    if (!isRejected) {
      return res.status(400).json({
        error: 'Refund hanya dapat diajukan untuk scrim yang ditolak atau dibatalkan.',
      });
    }

    const bankOrWallet = String(req.body.bankOrWallet || '').trim().slice(0, 60);
    const accountNumber = String(req.body.accountNumber || '').trim().slice(0, 40);
    const accountName = String(req.body.accountName || '').trim().slice(0, 80);
    const reason = String(req.body.reason || '').trim().slice(0, 240);

    if (!bankOrWallet || accountNumber.replace(/\D/g, '').length < 6 || !accountName) {
      return res.status(400).json({
        error: 'Lengkapi Bank/E-Wallet, nomor rekening (min 6 digit), dan nama pemilik rekening.',
      });
    }

    if (!Array.isArray(scrim.refundRequests)) {
      scrim.refundRequests = [];
    }
    if (scrim.refundRequests.some((r) => r.requestedByEmail.toLowerCase() === authUser.email.toLowerCase())) {
      return res.status(400).json({
        error: 'Tim Anda sudah mengajukan refund untuk sesi scrim ini.',
      });
    }

    const teamName = authUser.teamProfile?.teamName || authUser.displayName;

    scrim.refundRequests.push({
      id: makeId('rfd'),
      teamName,
      side: isChallenger ? 'challenger' : 'host',
      amount: scrim.splitCostPerTeam,
      bankOrWallet,
      accountNumber,
      accountName,
      reason: reason || 'Scrim ditolak oleh Caster',
      status: 'REQUESTED',
      requestedByEmail: authUser.email,
      requestedAt: new Date().toISOString(),
    });

    ensurePaymentRecords(db);
    saveDb(db);
    res.status(201).json({ scrim: sanitizeScrimForRole(scrim, authUser) });
  });

  function applyGatewaySettlement(
    db: OrdalDatabase,
    payment: PaymentRecord,
    meta: {
      channel?: GatewayChannel;
      provider?: GatewayProvider;
      referenceCode: string;
      actorName: string;
      actorRole: 'SYSTEM' | 'SUPER_ADMIN';
      note: string;
    }
  ): boolean {
    if (payment.status === 'VERIFIED') return false;
    const nowIso = new Date().toISOString();
    payment.status = 'VERIFIED';
    payment.referenceCode = meta.referenceCode;
    payment.validatedAt = nowIso;
    payment.validatedBy = meta.actorName;
    if (meta.provider) payment.gatewayProvider = meta.provider;
    if (meta.channel) {
      payment.gatewayChannel = meta.channel;
      payment.paymentMethod = GATEWAY_CHANNEL_META[meta.channel]?.method || payment.paymentMethod;
    }
    payment.validationNote = meta.note;

    if (payment.category === 'SCRIM_SPLIT_BILL' && payment.scrimId) {
      const scrim = db.scrims.find((s) => s.id === payment.scrimId);
      if (scrim) {
        if (payment.scrimSide === 'challenger') scrim.challengerPaid = true;
        else scrim.hostPaid = true;
        if (scrim.hostPaid && scrim.challengerPaid) {
          scrim.status = 'CONFIRMED';
          scrim.paymentDeadlineAt = undefined;
        } else {
          scrim.status = 'PARTIALLY_PAID';
        }
      }
    }

    payment.history.push({
      id: makeId('pevt'),
      timestamp: nowIso,
      action: 'GATEWAY_SETTLED',
      actorName: meta.actorName,
      actorRole: meta.actorRole,
      note: meta.note,
    });

    recordSettlementLedgerForVerifiedPayment(db, payment, 'gateway@ordal.id');
    return true;
  }

  // Only SUPER_ADMIN can bypass manual proof / gateway settlement via legacy /pay endpoint
  app.post('/api/scrims/:id/pay', requireRoles('SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });
    const side = req.body.side === 'challenger' ? 'challenger' : 'host';

    if (side === 'host') scrim.hostPaid = true;
    if (side === 'challenger') scrim.challengerPaid = true;

    if (scrim.hostPaid && scrim.challengerPaid) {
      scrim.status = 'CONFIRMED';
      scrim.paymentDeadlineAt = undefined;
    } else if (scrim.hostPaid || scrim.challengerPaid) {
      scrim.status = 'PARTIALLY_PAID';
    }
    ensurePaymentRecords(db);
    const payId = `pay-scr-${scrim.id}-${side}`;
    const payRec = (db.payments || []).find((p) => p.id === payId);
    if (payRec) {
      const methodRaw = String(req.body.paymentMethod || 'INTERNAL_ADMIN').toUpperCase() as PaymentMethod;
      payRec.paymentMethod = ALLOWED_PAYMENT_METHODS.includes(methodRaw) ? methodRaw : 'INTERNAL_ADMIN';
      if (req.body.referenceCode) {
        payRec.referenceCode = String(req.body.referenceCode).trim().slice(0, 80);
      }
      payRec.status = 'VERIFIED';
      payRec.validatedAt = new Date().toISOString();
      payRec.validatedBy = authUser?.email || 'ORDAL System';
      payRec.history.push({
        id: makeId('pevt'),
        timestamp: payRec.validatedAt,
        action: 'PAYMENT_VALIDATED',
        actorName: authUser?.displayName || 'Super Admin ORDAL',
        actorRole: 'SUPER_ADMIN',
        note: 'Dikonfirmasi lunas oleh Super Admin melalui Scrim Arena.',
      });
      recordSettlementLedgerForVerifiedPayment(db, payRec, authUser?.email);
    }
    appendAuditLog(db, req, {
      resource: 'PAYMENT',
      action: 'UPDATE',
      targetId: scrim.id,
      targetLabel: `${scrim.hostTeamName} vs ${scrim.challengerTeamName || 'Open'}`,
      summary: `Admin override konfirmasi lunas split-bill sisi ${side.toUpperCase()} pada scrim ${scrim.game}.`,
    });
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  // --- AUTOMATED INDONESIAN PAYMENT GATEWAY (QRIS DINAMIS & VIRTUAL ACCOUNT) ---
  app.post('/api/payments/:id/gateway-checkout', requireRoles('TEAM', 'SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const db = loadDb();
    ensurePaymentRecords(db);
    const payment = (db.payments || []).find((p) => p.id === req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Invoice pembayaran tidak ditemukan.' });
    }
    if (payment.category !== 'SCRIM_SPLIT_BILL' || !payment.scrimId) {
      return res.status(400).json({ error: 'Checkout Payment Gateway hanya tersedia untuk tagihan split-bill scrim.' });
    }
    if (payment.status === 'VERIFIED') {
      return res.status(400).json({ error: 'Invoice ini sudah berstatus lunas & tervalidasi.' });
    }
    if (payment.status === 'EXPIRED') {
      return res.status(400).json({ error: 'Invoice sudah kedaluwarsa melewati batas waktu 15 menit.' });
    }

    const scrim = db.scrims.find((s) => s.id === payment.scrimId);
    if (!scrim) {
      return res.status(404).json({ error: 'Sesi scrim terkait invoice tidak ditemukan.' });
    }

    if (authUser.role === 'TEAM') {
      const myTeam = (authUser.teamProfile?.teamName || authUser.displayName || '').trim().toLowerCase();
      const expectedTeam = (
        payment.scrimSide === 'challenger' ? scrim.challengerTeamName : scrim.hostTeamName
      )
        .trim()
        .toLowerCase();
      if (!myTeam || myTeam !== expectedTeam) {
        recordSocEvent({
          severity: 'HIGH',
          category: 'RBAC_VIOLATION',
          ip: getClientIp(req),
          method: req.method,
          path: req.path,
          actorEmail: authUser.email,
          actorRole: authUser.role,
          summary: `Percobaan inisiasi checkout gateway invoice tim lain (${payment.invoiceNumber}) oleh ${authUser.email}.`,
        });
        return res.status(403).json({
          error: 'Anda hanya dapat membuat checkout pembayaran untuk invoice milik tim Anda sendiri.',
        });
      }
    }

    const channel = String(req.body.channel || 'QRIS_DINAMIS').trim().toUpperCase() as GatewayChannel;
    const meta = GATEWAY_CHANNEL_META[channel];
    if (!meta) {
      return res.status(400).json({ error: 'Channel Payment Gateway tidak valid.' });
    }

    const baseAmount = payment.baseAmount ?? scrim.splitCostPerTeam ?? payment.amount;
    const gatewayFee = meta.calcFee(baseAmount);
    const totalAmount = baseAmount + gatewayFee;
    const orderId =
      payment.gatewayOrderId ||
      `ORDAL-${payment.invoiceNumber.replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase()}`;
    const idempotencyKey = payment.idempotencyKey || makeId('idem');
    const nowIso = new Date().toISOString();
    const expiresAt =
      scrim.paymentDeadlineAt ||
      payment.dueAt ||
      new Date(Date.now() + 15 * 60 * 1000).toISOString();

    payment.baseAmount = baseAmount;
    payment.gatewayFee = gatewayFee;
    payment.amount = totalAmount;
    payment.paymentMethod = meta.method;
    payment.gatewayProvider = ACTIVE_GATEWAY_PROVIDER;
    payment.gatewayChannel = channel;
    payment.gatewayOrderId = orderId;
    payment.idempotencyKey = idempotencyKey;
    payment.gatewayExpiresAt = expiresAt;
    payment.dueAt = expiresAt;

    if (channel === 'QRIS_DINAMIS') {
      payment.qrPayload = buildEmvQrisPayload({
        invoiceNumber: payment.invoiceNumber,
        amount: totalAmount,
      });
      payment.vaNumber = undefined;
    } else {
      payment.vaNumber = buildVaNumber(channel, payment.invoiceNumber);
      payment.qrPayload = undefined;
    }

    const baseLineItems = payment.lineItems.filter(
      (item) =>
        !item.label.startsWith('MDR QRIS') &&
        !item.label.startsWith('Biaya Payment Gateway')
    );
    payment.lineItems = [
      ...baseLineItems,
      { label: meta.feeLabel, amount: gatewayFee },
    ];

    payment.history.push({
      id: makeId('pevt'),
      timestamp: nowIso,
      action: 'GATEWAY_CREATED',
      actorName: authUser.teamProfile?.teamName || authUser.displayName,
      actorRole: authUser.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'TEAM',
      note: `Checkout ${meta.label} (${ACTIVE_GATEWAY_PROVIDER}) diterbitkan · Order ID: ${orderId} · Total Rp ${totalAmount.toLocaleString('id-ID')}.`,
    });

    saveDb(db);
    res.json({ payment, gatewayMode: PAYMENT_GATEWAY_PROVIDER_MODE });
  });

  app.post('/api/payments/:id/sandbox-simulate', requireRoles('TEAM', 'SUPER_ADMIN'), (req, res) => {
    const allowSandbox =
      PAYMENT_GATEWAY_PROVIDER_MODE === 'SANDBOX' && getConfiguredEnvSecret('PAYMENT_ALLOW_SANDBOX') !== 'false';
    if (!allowSandbox) {
      return res.status(403).json({
        error: 'Simulasi Sandbox dinonaktifkan pada konfigurasi server produksi.',
      });
    }
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

    const db = loadDb();
    ensurePaymentRecords(db);
    const payment = (db.payments || []).find((p) => p.id === req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
    }
    if (payment.status === 'VERIFIED') {
      return res.json({ payment, alreadySettled: true });
    }
    if (payment.status === 'EXPIRED') {
      return res.status(400).json({ error: 'Invoice telah kedaluwarsa dan tidak dapat dibayar lagi.' });
    }
    if (!payment.gatewayOrderId || !payment.gatewayChannel) {
      return res.status(400).json({
        error: 'Silakan generate QRIS Dinamis atau Nomor Virtual Account terlebih dahulu.',
      });
    }

    if (authUser.role === 'TEAM' && payment.scrimId) {
      const scrim = db.scrims.find((s) => s.id === payment.scrimId);
      const myTeam = (authUser.teamProfile?.teamName || authUser.displayName || '').trim().toLowerCase();
      const expectedTeam = (
        (payment.scrimSide === 'challenger' ? scrim?.challengerTeamName : scrim?.hostTeamName) || ''
      )
        .trim()
        .toLowerCase();
      if (!myTeam || myTeam !== expectedTeam) {
        return res.status(403).json({
          error: 'Anda tidak berhak menyimulasikan pembayaran untuk invoice tim lain.',
        });
      }
    }

    const refCode = `SBX-${payment.gatewayChannel}-${Date.now().toString(36).toUpperCase()}`;
    const settled = applyGatewaySettlement(db, payment, {
      provider: 'ORDAL_SANDBOX_PG',
      channel: payment.gatewayChannel,
      referenceCode: refCode,
      actorName: 'ORDAL Gateway Sandbox',
      actorRole: 'SYSTEM',
      note: `Settlement otomatis via Sandbox Webhook (${payment.gatewayChannel} · Order: ${payment.gatewayOrderId} · Ref: ${refCode}).`,
    });

    if (settled) saveDb(db);
    res.json({ payment, alreadySettled: !settled });
  });

  // External PG Webhook Callback (IP allowlist + HMAC-SHA256 signature verification + timingSafeEqual + idempotent)
  app.post('/api/payments/webhook', (req, res) => {
    const allowlistRaw = getConfiguredEnvSecret('PAYMENT_GATEWAY_WEBHOOK_IP_ALLOWLIST');
    if (allowlistRaw) {
      const allowedIps = allowlistRaw
        .split(',')
        .map((s) => s.trim().replace(/^::ffff:/, ''))
        .filter(Boolean);
      const clientIp = getClientIp(req);
      if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
        recordSocEvent({
          severity: 'HIGH',
          category: 'AUTH_FAILURE',
          ip: clientIp,
          method: req.method,
          path: req.path,
          summary: `Callback webhook pembayaran ditolak dari IP di luar allowlist (${clientIp}).`,
        });
        return res.status(403).json({ error: 'IP pengirim webhook tidak diizinkan.' });
      }
    }

    const sigHeader = String(req.headers['x-ordal-signature'] || '').trim();
    if (!sigHeader) {
      recordSocEvent({
        severity: 'HIGH',
        category: 'AUTH_FAILURE',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        summary: 'Percobaan akses webhook pembayaran tanpa header X-Ordal-Signature.',
      });
      return res.status(401).json({ error: 'Missing X-Ordal-Signature header.' });
    }

    const payloadString = JSON.stringify(req.body || {});
    const expectedSig = crypto
      .createHmac('sha256', PAYMENT_GATEWAY_WEBHOOK_SECRET)
      .update(payloadString)
      .digest('hex');

    const actualBuf = Buffer.from(sigHeader, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      recordSocEvent({
        severity: 'CRITICAL',
        category: 'AUTH_FAILURE',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        summary: 'Signature HMAC webhook pembayaran tidak valid (indikasi spoofing callback).',
      });
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const orderId = String(req.body?.orderId || '').trim();
    const grossAmount = Number(req.body?.grossAmount);
    const providerRef = String(req.body?.referenceCode || orderId).trim().slice(0, 80);
    const txStatus = String(req.body?.status || 'SETTLEMENT').trim().toUpperCase();

    if (!orderId || !Number.isFinite(grossAmount)) {
      return res.status(400).json({ error: 'Invalid webhook payload: orderId and grossAmount required.' });
    }

    const db = loadDb();
    ensurePaymentRecords(db);
    const payment = (db.payments || []).find(
      (p) => p.gatewayOrderId === orderId || p.id === orderId
    );
    if (!payment) {
      return res.status(404).json({ error: 'Order pembayaran tidak ditemukan.' });
    }
    if (payment.status === 'VERIFIED') {
      return res.json({ ok: true, idempotent: true, invoiceNumber: payment.invoiceNumber });
    }
    if (payment.status === 'EXPIRED') {
      return res.status(409).json({ error: 'Invoice sudah kedaluwarsa.' });
    }
    if (Math.round(grossAmount) !== Math.round(payment.amount)) {
      recordSocEvent({
        severity: 'HIGH',
        category: 'WAF_BLOCK',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        summary: `Nominal webhook tidak cocok pada ${payment.invoiceNumber}: diterima Rp ${grossAmount}, tagihan Rp ${payment.amount}.`,
      });
      return res.status(400).json({ error: 'Gross amount mismatch.' });
    }

    if (txStatus === 'SETTLEMENT' || txStatus === 'PAID' || txStatus === 'CAPTURE') {
      applyGatewaySettlement(db, payment, {
        provider: payment.gatewayProvider || ACTIVE_GATEWAY_PROVIDER,
        channel: payment.gatewayChannel,
        referenceCode: providerRef,
        actorName: `Webhook ${payment.gatewayProvider || ACTIVE_GATEWAY_PROVIDER}`,
        actorRole: 'SYSTEM',
        note: `Settlement terverifikasi via signed PG Webhook (${payment.gatewayOrderId} · Ref: ${providerRef}).`,
      });
      saveDb(db);
    }

    res.json({ ok: true, idempotent: false, invoiceNumber: payment.invoiceNumber, status: payment.status });
  });

  // --- PAYMENT INVOICE, PROOF SUBMISSION, VALIDATION & HISTORY ---
  app.post('/api/payments/:id/submit', requireRoles('TEAM', 'SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const db = loadDb();
    ensurePaymentRecords(db);
    const payment = (db.payments || []).find((p) => p.id === req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Invoice pembayaran tidak ditemukan.' });
    }
    if (payment.category !== 'SCRIM_SPLIT_BILL' || !payment.scrimId) {
      return res.status(400).json({ error: 'Jenis tagihan ini tidak mendukung konfirmasi manual tim.' });
    }
    if (payment.status === 'VERIFIED') {
      return res.status(400).json({ error: 'Invoice ini sudah berstatus lunas & tervalidasi.' });
    }
    if (payment.status === 'EXPIRED') {
      return res.status(400).json({ error: 'Invoice sudah kedaluwarsa karena melewati batas waktu 15 menit.' });
    }

    const scrim = db.scrims.find((s) => s.id === payment.scrimId);
    if (!scrim) {
      return res.status(404).json({ error: 'Sesi scrim terkait invoice tidak ditemukan.' });
    }

    if (authUser.role === 'TEAM') {
      const myTeam = (authUser.teamProfile?.teamName || authUser.displayName || '').trim().toLowerCase();
      const expectedTeam = (
        payment.scrimSide === 'challenger' ? scrim.challengerTeamName : scrim.hostTeamName
      )
        .trim()
        .toLowerCase();
      if (!myTeam || myTeam !== expectedTeam) {
        recordSocEvent({
          severity: 'HIGH',
          category: 'RBAC_VIOLATION',
          ip: getClientIp(req),
          method: req.method,
          path: req.path,
          actorEmail: authUser.email,
          actorRole: authUser.role,
          summary: `Percobaan kirim bukti bayar invoice tim lain (${payment.invoiceNumber}) oleh ${authUser.email}.`,
        });
        return res.status(403).json({
          error: 'Anda hanya dapat mengirimkan bukti pembayaran untuk invoice milik tim Anda sendiri.',
        });
      }
    }

    const rawMethod = String(req.body.paymentMethod || '').trim().toUpperCase() as PaymentMethod;
    if (!ALLOWED_PAYMENT_METHODS.includes(rawMethod)) {
      return res.status(400).json({ error: 'Pilih metode pembayaran yang valid.' });
    }

    const referenceCode = String(req.body.referenceCode || '').trim().slice(0, 80);
    if (referenceCode.length < 4) {
      return res.status(400).json({
        error: 'Masukkan nomor referensi / kode transaksi minimal 4 karakter.',
      });
    }

    const refLower = referenceCode.toLowerCase();
    const duplicateRef = (db.payments || []).find(
      (p) =>
        p.id !== payment.id &&
        (p.status === 'VERIFIED' || p.status === 'PENDING_VALIDATION') &&
        p.referenceCode?.trim().toLowerCase() === refLower
    );
    if (duplicateRef) {
      return res.status(400).json({
        error: `Kode referensi "${referenceCode}" sudah pernah digunakan pada invoice ${duplicateRef.invoiceNumber}. Gunakan nomor transaksi yang berbeda.`,
      });
    }

    const proofNote = String(req.body.proofNote || '').trim().slice(0, 240);
    const proofCheck = sanitizeImageUrl(req.body.proofImageUrl);
    if (!proofCheck.ok) {
      return res.status(400).json({ error: proofCheck.error });
    }

    const nowIso = new Date().toISOString();
    payment.paymentMethod = rawMethod;
    payment.referenceCode = referenceCode;
    payment.proofNote = proofNote || undefined;
    if (proofCheck.value !== undefined) {
      payment.proofImageUrl = proofCheck.value;
    }
    payment.submittedAt = nowIso;
    payment.validationNote = undefined;

    if (authUser.role === 'SUPER_ADMIN') {
      payment.status = 'VERIFIED';
      payment.validatedAt = nowIso;
      payment.validatedBy = authUser.email;
      if (payment.scrimSide === 'challenger') scrim.challengerPaid = true;
      else scrim.hostPaid = true;
      if (scrim.hostPaid && scrim.challengerPaid) {
        scrim.status = 'CONFIRMED';
        scrim.paymentDeadlineAt = undefined;
      } else {
        scrim.status = 'PARTIALLY_PAID';
      }
      payment.history.push({
        id: makeId('pevt'),
        timestamp: nowIso,
        action: 'PAYMENT_VALIDATED',
        actorName: authUser.displayName,
        actorRole: 'SUPER_ADMIN',
        note: `Pembayaran diinput & divalidasi langsung oleh Admin (${rawMethod} · Ref: ${referenceCode}).`,
      });
      recordSettlementLedgerForVerifiedPayment(db, payment, authUser.email);
    } else {
      payment.status = 'PENDING_VALIDATION';
      payment.history.push({
        id: makeId('pevt'),
        timestamp: nowIso,
        action: 'PAYMENT_SUBMITTED',
        actorName: authUser.teamProfile?.teamName || authUser.displayName,
        actorRole: 'TEAM',
        note: `Bukti bayar dikirim (${rawMethod} · Ref: ${referenceCode}). Menunggu validasi Admin.`,
      });
    }

    saveDb(db);
    res.json({ payment });
  });

  app.post('/api/payments/:id/validate', requireRoles('SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

    const db = loadDb();
    ensurePaymentRecords(db);
    const payment = (db.payments || []).find((p) => p.id === req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Data pembayaran/invoice tidak ditemukan.' });
    }

    const decision = req.body.decision === 'REJECT' ? 'REJECT' : 'APPROVE';
    const referenceCode = String(req.body.referenceCode || payment.referenceCode || '').trim().slice(0, 80);
    const validationNote = String(req.body.validationNote || '').trim().slice(0, 240);
    const proofCheck = sanitizeImageUrl(req.body.proofImageUrl);
    if (!proofCheck.ok) {
      return res.status(400).json({ error: proofCheck.error });
    }

    if (decision === 'REJECT' && validationNote.length < 4) {
      return res.status(400).json({
        error: 'Sertakan alasan penolakan minimal 4 karakter agar pengguna dapat memperbaikinya.',
      });
    }

    const nowIso = new Date().toISOString();
    const formattedProcessed =
      new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WIB';

    payment.status = decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    if (referenceCode) payment.referenceCode = referenceCode;
    if (proofCheck.value) payment.proofImageUrl = proofCheck.value;
    payment.validationNote = validationNote || undefined;
    payment.validatedAt = nowIso;
    payment.validatedBy = authUser.email;

    if (payment.category === 'SCRIM_SPLIT_BILL' && payment.scrimId) {
      const scrim = db.scrims.find((s) => s.id === payment.scrimId);
      if (scrim) {
        if (decision === 'APPROVE') {
          if (payment.scrimSide === 'challenger') scrim.challengerPaid = true;
          else scrim.hostPaid = true;
          if (scrim.hostPaid && scrim.challengerPaid) {
            scrim.status = 'CONFIRMED';
            scrim.paymentDeadlineAt = undefined;
          } else {
            scrim.status = 'PARTIALLY_PAID';
          }
        } else {
          if (payment.scrimSide === 'challenger') scrim.challengerPaid = false;
          else scrim.hostPaid = false;
          if (scrim.status !== 'CANCELLED') {
            scrim.status = scrim.hostPaid || scrim.challengerPaid ? 'PARTIALLY_PAID' : 'AWAITING_PAYMENT';
          }
        }
      }
    } else if (payment.category === 'CASTER_PAYOUT' && payment.withdrawalId) {
      const wdr = (db.withdrawals || []).find((w) => w.id === payment.withdrawalId);
      if (wdr) {
        wdr.status = decision === 'APPROVE' ? 'PAID' : 'REJECTED';
        wdr.processedAt = formattedProcessed;
      }
    } else if (payment.category === 'SCRIM_REFUND' && payment.scrimId) {
      const scrim = db.scrims.find((s) => s.id === payment.scrimId);
      const rfdId = payment.id.replace(/^pay-rfd-/, '');
      const rfd = scrim?.refundRequests?.find((r) => r.id === rfdId);
      if (rfd && decision === 'APPROVE') {
        rfd.status = 'REFUNDED';
      }
    }

    payment.history.push({
      id: makeId('pevt'),
      timestamp: nowIso,
      action: decision === 'APPROVE' ? 'PAYMENT_VALIDATED' : 'PAYMENT_REJECTED',
      actorName: authUser.displayName,
      actorRole: 'SUPER_ADMIN',
      note:
        decision === 'APPROVE'
          ? validationNote || `Pembayaran divalidasi lunas${referenceCode ? ` (Ref: ${referenceCode})` : ''}.`
          : `Pembayaran ditolak: ${validationNote}`,
    });

    if (decision === 'APPROVE') {
      recordSettlementLedgerForVerifiedPayment(db, payment, authUser.email);
    }

    appendAuditLog(db, req, {
      resource: 'PAYMENT',
      action: 'UPDATE',
      targetId: payment.id,
      targetLabel: payment.invoiceNumber,
      summary: `${decision === 'APPROVE' ? 'Validasi lunas' : 'Penolakan'} invoice ${payment.invoiceNumber} (${payment.category}) senilai Rp ${payment.amount.toLocaleString('id-ID')}.`,
    });

    saveDb(db);
    res.json({ payment });
  });

  app.post('/api/scrims/:id/release', requireRoles('TEAM', 'SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });

    // Security Fix (CRITICAL-02): Only Super Admin or the host team (before CONFIRMED) may release
    if (authUser?.role === 'TEAM') {
      const teamName = (authUser.teamProfile?.teamName || authUser.displayName || '')
        .trim()
        .toLowerCase();
      const hostName = (scrim.hostTeamName || '').trim().toLowerCase();
      if (!teamName || teamName !== hostName) {
        recordSocEvent({
          severity: 'HIGH',
          category: 'RBAC_VIOLATION',
          ip: getClientIp(req),
          method: req.method,
          path: req.path,
          actorEmail: authUser.email,
          actorRole: authUser.role,
          summary: `Percobaan release lobby scrim milik tim lain oleh ${authUser.email}.`,
        });
        return res.status(403).json({
          error: 'Hanya tim Host pemilik lobby atau Super Admin yang dapat me-release scrim ini.',
        });
      }
      if (scrim.status === 'CONFIRMED') {
        return res.status(400).json({
          error: 'Scrim yang sudah CONFIRMED tidak dapat di-release oleh tim. Hubungi Admin.',
        });
      }
    }

    // Protect teams that already paid when opponent expires/releases slot: auto-issue refund ticket
    const wasHostPaid = Boolean(scrim.hostPaid);
    const wasChallengerPaid = Boolean(scrim.challengerPaid);
    const paidHostInv = wasHostPaid
      ? (db.payments || []).find(
          (p) => p.scrimId === scrim.id && p.category === 'SCRIM_SPLIT_BILL' && p.scrimSide === 'host'
        )
      : undefined;
    const paidChallengerInv = wasChallengerPaid
      ? (db.payments || []).find(
          (p) =>
            p.scrimId === scrim.id &&
            p.category === 'SCRIM_SPLIT_BILL' &&
            p.scrimSide === 'challenger'
        )
      : undefined;

    const autoRefundSides: Array<{
      side: 'host' | 'challenger';
      teamName: string;
      email: string;
      amount: number;
    }> = [];
    if (wasHostPaid) {
      autoRefundSides.push({
        side: 'host',
        teamName: scrim.hostTeamName,
        email: scrim.hostUserEmail || authUser?.email || 'team@ordal.id',
        amount: paidHostInv?.baseAmount ?? scrim.splitCostPerTeam,
      });
    }
    if (wasChallengerPaid && scrim.challengerTeamName) {
      autoRefundSides.push({
        side: 'challenger',
        teamName: scrim.challengerTeamName,
        email: scrim.challengerUserEmail || authUser?.email || 'team@ordal.id',
        amount: paidChallengerInv?.baseAmount ?? scrim.splitCostPerTeam,
      });
    }

    if (autoRefundSides.length > 0) {
      if (!Array.isArray(scrim.refundRequests)) scrim.refundRequests = [];
      for (const rs of autoRefundSides) {
        const rfdId = makeId('rfd');
        const nowIso = new Date().toISOString();
        scrim.refundRequests.push({
          id: rfdId,
          teamName: rs.teamName,
          side: rs.side,
          amount: rs.amount,
          bankOrWallet: 'ORDAL Escrow Refund',
          accountNumber: 'KONFIRMASI-ADMIN',
          accountName: rs.teamName,
          reason: 'Auto-Refund: Lawan gagal bayar sebelum batas waktu 15 menit (Slot Release)',
          status: 'REQUESTED',
          requestedByEmail: rs.email,
          requestedAt: nowIso,
        });
        const rfdPayment: PaymentRecord = {
          id: `pay-rfd-${rfdId}`,
          invoiceNumber: formatInvoiceCode('RFD', rfdId),
          category: 'SCRIM_REFUND',
          status: 'PENDING_VALIDATION',
          scrimId: scrim.id,
          scrimSide: rs.side,
          game: scrim.game,
          title: `Auto-Refund Escrow ${scrim.game}: ${rs.teamName}`,
          payerName: 'ORDAL Esports Hub',
          payerEmail: rs.email,
          receiverName: rs.teamName,
          amount: rs.amount,
          lineItems: [
            {
              label: `Pengembalian Dana Split-Bill (Slot Release Timeout Lawan)`,
              amount: rs.amount,
            },
          ],
          bankOrWallet: 'ORDAL Escrow Refund',
          accountNumber: 'KONFIRMASI-ADMIN',
          accountName: rs.teamName,
          proofNote: 'Otomatis diterbitkan sistem saat slot di-release karena lawan timeout.',
          issuedAt: nowIso,
          submittedAt: nowIso,
          history: [
            {
              id: makeId('pevt'),
              timestamp: nowIso,
              action: 'AUTO_REFUND_ISSUED',
              actorName: 'ORDAL Auto-Escrow',
              actorRole: 'SYSTEM',
              note: `Tiket refund otomatis untuk ${rs.teamName} karena slot di-release.`,
            },
          ],
        };
        if (!Array.isArray(db.payments)) db.payments = [];
        db.payments.unshift(rfdPayment);
        recordRefundIssuanceLedger(db, rfdPayment, authUser?.email);
      }
    }

    scrim.hostPaid = false;
    scrim.challengerPaid = false;
    scrim.paymentDeadlineAt = undefined;
    scrim.challengerTeamName = '';
    scrim.challengerTeamLogo = '';
    scrim.challengerRosterCore = [];
    scrim.challengerRosterSub = [];
    scrim.mode = 'OPEN_LOBBY';
    scrim.status = 'OPEN_LOBBY';
    db.payments = (db.payments || []).filter(
      (p) => !(p.scrimId === scrim.id && p.category === 'SCRIM_SPLIT_BILL' && p.status !== 'VERIFIED')
    );
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  app.post('/api/scrims/:id/caster-decision', requireRoles('CASTER', 'SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });
    if (authUser?.role === 'CASTER' && authUser.casterId && scrim.casterId !== authUser.casterId) {
      return res.status(403).json({ error: 'Anda hanya dapat mengapprove match milik Anda sendiri.' });
    }
    const decision = req.body.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';

    if (decision === 'APPROVED' && scrim.casterId !== 'none') {
      const caster = db.casters.find((c) => c.id === scrim.casterId);
      const slotConflict = db.scrims.find(
        (s) =>
          s.id !== scrim.id &&
          s.casterId === scrim.casterId &&
          s.date === scrim.date &&
          s.timeSlot === scrim.timeSlot &&
          s.casterApprovalStatus === 'APPROVED' &&
          s.status !== 'CANCELLED'
      );
      if (slotConflict) {
        return res.status(400).json({
          error: `BENTROK JADWAL: Anda sudah menyetujui match ${slotConflict.hostTeamName} pada ${scrim.date} jam ${scrim.timeSlot}.`,
        });
      }
      const approvedCount = db.scrims.filter(
        (s) =>
          s.id !== scrim.id &&
          s.casterId === scrim.casterId &&
          s.date === scrim.date &&
          s.casterApprovalStatus === 'APPROVED' &&
          s.status !== 'CANCELLED'
      ).length;
      const limit = caster?.maxMatchesPerDay || 2;
      if (approvedCount >= limit) {
        return res.status(400).json({
          error: `Kuota maksimal ${limit} match pada tanggal ${scrim.date} sudah penuh (Full Book).`,
        });
      }
    }

    scrim.casterApprovalStatus = decision;
    if (decision === 'REJECTED') {
      scrim.status = 'CANCELLED';
      scrim.paymentDeadlineAt = undefined;
    } else if (scrim.status === 'WAITING_APPROVAL') {
      scrim.status = 'AWAITING_PAYMENT';
      scrim.paymentDeadlineAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    ensurePaymentRecords(db);
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  app.post('/api/scrims/:id/result', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });
    if (!scrim.challengerTeamName) {
      return res.status(400).json({ error: 'Belum ada tim penantang untuk mencatat hasil match.' });
    }
    const hostScore = Math.max(0, Number(req.body.hostScore ?? 0));
    const challengerScore = Math.max(0, Number(req.body.challengerScore ?? 0));
    scrim.hostScore = hostScore;
    scrim.challengerScore = challengerScore;
    scrim.winnerSide =
      hostScore > challengerScore
        ? 'host'
        : challengerScore > hostScore
          ? 'challenger'
          : 'draw';
    scrim.resultRecorded = true;
    scrim.status = 'CONFIRMED';
    saveDb(db);
    res.json(scrim);
  });

  app.put('/api/scrims/:id', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const idx = db.scrims.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });
    const existing = db.scrims[idx];
    const matchedCaster =
      req.body.casterId && req.body.casterId !== 'none'
        ? db.casters.find((c) => c.id === req.body.casterId)
        : req.body.casterName
          ? db.casters.find((c) => c.name === req.body.casterName)
          : undefined;
    const nextCasterId = matchedCaster
      ? matchedCaster.id
      : String(req.body.casterId ?? existing.casterId ?? 'none');
    const nextDate = String(req.body.date ?? existing.date);
    const nextTimeSlot = String(req.body.timeSlot ?? existing.timeSlot);
    const nextStatus = String(req.body.status ?? existing.status);

    if (nextCasterId && nextCasterId !== 'none' && nextStatus !== 'CANCELLED') {
      const targetCaster = db.casters.find((c) => c.id === nextCasterId);
      if (targetCaster) {
        if (targetCaster.dayOffDates.includes(nextDate)) {
          return res.status(400).json({
            error: `${targetCaster.name} sedang FULL DAY OFF pada tanggal ${nextDate}.`,
          });
        }
        const blockedSlotsOnNextDate = targetCaster.dayOffSlots?.[nextDate] || [];
        if (blockedSlotsOnNextDate.includes(nextTimeSlot)) {
          return res.status(400).json({
            error: `${targetCaster.name} sedang DAY OFF pada ${nextDate} jam ${nextTimeSlot}.`,
          });
        }
        const slotConflict = db.scrims.find(
          (s) =>
            s.id !== existing.id &&
            s.casterId === targetCaster.id &&
            s.date === nextDate &&
            s.timeSlot === nextTimeSlot &&
            s.status !== 'CANCELLED' &&
            s.casterApprovalStatus !== 'REJECTED'
        );
        if (slotConflict) {
          return res.status(400).json({
            error: `BENTROK JADWAL: ${targetCaster.name} sudah terjadwal pada ${nextDate} jam ${nextTimeSlot}.`,
          });
        }
        const dailyCount = db.scrims.filter(
          (s) =>
            s.id !== existing.id &&
            s.casterId === targetCaster.id &&
            s.date === nextDate &&
            s.status !== 'CANCELLED' &&
            s.casterApprovalStatus !== 'REJECTED'
        ).length;
        const baseLimit = targetCaster.maxMatchesPerDay || 2;
        const limit = blockedSlotsOnNextDate.length > 0 ? Math.max(1, baseLimit - 1) : baseLimit;
        if (dailyCount >= limit) {
          return res.status(400).json({
            error: `${targetCaster.name} sudah FULL BOOK (${dailyCount}/${limit} match) pada ${nextDate}.`,
          });
        }
      }
    }

    const casterRate =
      req.body.casterId === 'none'
        ? 0
        : Number(req.body.casterRate ?? matchedCaster?.rateCard ?? existing.casterRate);
    const nextGame = (req.body.game ?? existing.game) as ScrimGame;
    const rawCustomFee = req.body.platformFee;
    const platformFee =
      rawCustomFee !== undefined &&
      rawCustomFee !== '' &&
      Number.isFinite(Number(rawCustomFee)) &&
      Number(rawCustomFee) >= 0
        ? Math.round(Number(rawCustomFee))
        : getEffectiveLobbyFee(db, nextGame);
    const totalCost = casterRate + platformFee;
    db.scrims[idx] = {
      ...existing,
      ...req.body,
      id: req.params.id,
      casterId: matchedCaster ? matchedCaster.id : req.body.casterId ?? existing.casterId,
      casterName: matchedCaster ? matchedCaster.name : req.body.casterName ?? existing.casterName,
      casterRate,
      platformFee,
      totalCost,
      splitCostPerTeam: Math.round(totalCost / 2),
    };
    saveDb(db);
    res.json(db.scrims[idx]);
  });

  app.delete('/api/scrims/:id', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    db.scrims = db.scrims.filter((s) => s.id !== req.params.id);
    saveDb(db);
    res.json({ deleted: true });
  });

  // --- SHOUTCASTER DASHBOARD ENDPOINTS ---
  app.post('/api/casters', requireRoles('SUPER_ADMIN'), writeRateLimiter, (req, res) => {
    const name = String(req.body.name || '').trim();
    const alias = String(req.body.alias || '').trim().toUpperCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const rateCard = Number(req.body.rateCard);
    const maxMatchesPerDay = Number(req.body.maxMatchesPerDay ?? 2);
    const bio = String(req.body.bio || '').trim();
    const status: 'ACTIVE' | 'INACTIVE' = req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Nama Shoutcaster minimal 2 karakter.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email login caster tidak valid.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password awal caster minimal 8 karakter.' });
    }
    if (!Number.isFinite(rateCard) || rateCard < 0 || rateCard > 10000000) {
      return res.status(400).json({ error: 'Ratecard harus berupa angka antara Rp 0 hingga Rp 10.000.000.' });
    }

    const allowedGames: ScrimGame[] = ['POINT BLANK', 'FREE FIRE', 'EFOOTBALL'];
    const rawGames: string[] = Array.isArray(req.body.specialtyGames) ? req.body.specialtyGames : [];
    const specialtyGames = rawGames
      .map((g) => String(g).trim().toUpperCase() as ScrimGame)
      .filter((g) => allowedGames.includes(g));
    const finalGames: ScrimGame[] = specialtyGames.length > 0 ? Array.from(new Set(specialtyGames)) : ['POINT BLANK'];

    const authStore = loadAuthStore();
    if (authStore.users.some((u) => u.email.toLowerCase() === email)) {
      return res.status(409).json({ error: 'Email tersebut sudah terdaftar pada akun lain.' });
    }

    const isVerified = Boolean(req.body.isVerified);
    const isTopCaster = Boolean(req.body.isTopCaster);

    const db = loadDb();
    const casterId = makeId('cst');
    const newCaster: Shoutcaster = {
      id: casterId,
      name,
      alias: alias || name.split(/\s+/)[0].toUpperCase(),
      specialtyGames: finalGames,
      rateCard: Math.round(rateCard),
      maxMatchesPerDay: Math.max(1, Math.min(10, Math.round(Number.isFinite(maxMatchesPerDay) ? maxMatchesPerDay : 2))),
      dayOffDates: [],
      dayOffSlots: {},
      bio: bio || `Shoutcaster resmi ORDAL untuk cabang ${finalGames.join(', ')}.`,
      status,
      isVerified,
      isTopCaster,
    };

    const newUser: StoredUser = {
      id: makeId('usr-caster'),
      email,
      displayName: name,
      role: 'CASTER',
      casterId,
      passwordHash: hashPassword(password),
    };

    db.casters = [...(db.casters || []), newCaster];
    appendAuditLog(db, req, {
      resource: 'CASTER',
      action: 'CREATE',
      targetId: newCaster.id,
      targetLabel: newCaster.name,
      summary: `Menambahkan Shoutcaster baru ${newCaster.name}${isVerified || isTopCaster ? ` (${[isVerified ? 'Verified' : '', isTopCaster ? 'Top Caster' : ''].filter(Boolean).join(', ')})` : ''}.`,
      changedFields: ['name', 'rateCard', 'specialtyGames'],
    });
    saveDb(db);

    authStore.users.push(newUser);
    saveAuthStore(authStore);

    res.status(201).json({ caster: newCaster, user: toPublicUser(newUser) });
  });

  app.put('/api/casters/:id/badges', requireRoles('SUPER_ADMIN'), writeRateLimiter, (req, res) => {
    const db = loadDb();
    const idx = db.casters.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Shoutcaster tidak ditemukan' });

    const hasVerified = typeof req.body.isVerified === 'boolean';
    const hasTopCaster = typeof req.body.isTopCaster === 'boolean';
    if (!hasVerified && !hasTopCaster) {
      return res.status(400).json({
        error: 'Sertakan minimal satu status badge boolean (isVerified atau isTopCaster).',
      });
    }

    const existing = db.casters[idx];
    const nextVerified = hasVerified ? Boolean(req.body.isVerified) : Boolean(existing.isVerified);
    const nextTopCaster = hasTopCaster
      ? Boolean(req.body.isTopCaster)
      : Boolean(existing.isTopCaster);

    const changedFields: string[] = [];
    if (nextVerified !== Boolean(existing.isVerified)) changedFields.push('isVerified');
    if (nextTopCaster !== Boolean(existing.isTopCaster)) changedFields.push('isTopCaster');

    const updated: Shoutcaster = {
      ...existing,
      isVerified: nextVerified,
      isTopCaster: nextTopCaster,
    };

    db.casters[idx] = updated;
    if (changedFields.length > 0) {
      appendAuditLog(db, req, {
        resource: 'CASTER',
        action: 'UPDATE',
        targetId: updated.id,
        targetLabel: updated.name,
        summary: `Memperbarui badge caster ${updated.name}: Verified=${nextVerified ? 'YA' : 'TIDAK'}, Top Caster=${nextTopCaster ? 'YA' : 'TIDAK'}.`,
        changedFields,
      });
    }
    saveDb(db);
    res.json(updated);
  });

  app.put('/api/casters/:id', requireRoles('CASTER', 'SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (authUser?.role === 'CASTER' && authUser.casterId && authUser.casterId !== req.params.id) {
      return res.status(403).json({ error: 'Anda hanya dapat mengubah profil & ratecard milik Anda sendiri.' });
    }
    if (
      authUser?.role !== 'SUPER_ADMIN' &&
      ('isVerified' in req.body || 'isTopCaster' in req.body || 'status' in req.body)
    ) {
      return res.status(403).json({
        error: 'Hanya Super Admin yang berwenang mengatur badge Verified / Top Caster atau status talent.',
      });
    }
    const db = loadDb();
    const idx = db.casters.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Shoutcaster tidak ditemukan' });
    const existing = db.casters[idx];
    const nextDayOffDates: string[] = Array.isArray(req.body.dayOffDates)
      ? Array.from(
          new Set<string>(
            req.body.dayOffDates.map((d: unknown) => String(d ?? '').trim()).filter(Boolean)
          )
        ).sort()
      : existing.dayOffDates;

    const nextDayOffSlots: Record<string, string[]> =
      req.body.dayOffSlots && typeof req.body.dayOffSlots === 'object' && !Array.isArray(req.body.dayOffSlots)
        ? Object.entries(req.body.dayOffSlots as Record<string, unknown>).reduce<
            Record<string, string[]>
          >((acc, [dateKey, rawSlots]) => {
            const cleanDate = String(dateKey || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return acc;
            if (nextDayOffDates.includes(cleanDate)) return acc;
            if (!Array.isArray(rawSlots)) return acc;
            const cleanSlots = Array.from(
              new Set(rawSlots.map((s) => String(s || '').trim()).filter(Boolean))
            );
            if (cleanSlots.length > 0) {
              acc[cleanDate] = cleanSlots;
            }
            return acc;
          }, {})
        : existing.dayOffSlots || {};

    const allowedGames: ScrimGame[] = ['POINT BLANK', 'FREE FIRE', 'EFOOTBALL'];
    const nextSpecialtyGames: ScrimGame[] = Array.isArray(req.body.specialtyGames)
      ? Array.from(
          new Set<ScrimGame>(
            req.body.specialtyGames
              .map((g: unknown) => String(g || '').trim().toUpperCase() as ScrimGame)
              .filter((g: ScrimGame) => allowedGames.includes(g))
          )
        )
      : existing.specialtyGames;

    const nextRateCard =
      req.body.rateCard !== undefined && Number.isFinite(Number(req.body.rateCard))
        ? Math.max(0, Math.min(10000000, Math.round(Number(req.body.rateCard))))
        : existing.rateCard;

    const updated: Shoutcaster = {
      ...existing,
      id: req.params.id,
      name:
        typeof req.body.name === 'string' && req.body.name.trim().length >= 2
          ? req.body.name.trim()
          : existing.name,
      alias:
        typeof req.body.alias === 'string' && req.body.alias.trim()
          ? req.body.alias.trim().toUpperCase()
          : existing.alias,
      bio: typeof req.body.bio === 'string' ? req.body.bio.trim() : existing.bio,
      specialtyGames: nextSpecialtyGames.length > 0 ? nextSpecialtyGames : existing.specialtyGames,
      rateCard: nextRateCard,
      maxMatchesPerDay: 2, // Strictly max 2 matches/day (or 1 when partial dayOffSlots active)
      dayOffDates: nextDayOffDates,
      dayOffSlots: nextDayOffSlots,
      status:
        authUser?.role === 'SUPER_ADMIN' &&
        (req.body.status === 'ACTIVE' || req.body.status === 'INACTIVE')
          ? req.body.status
          : existing.status,
      isVerified:
        authUser?.role === 'SUPER_ADMIN' && typeof req.body.isVerified === 'boolean'
          ? req.body.isVerified
          : Boolean(existing.isVerified),
      isTopCaster:
        authUser?.role === 'SUPER_ADMIN' && typeof req.body.isTopCaster === 'boolean'
          ? req.body.isTopCaster
          : Boolean(existing.isTopCaster),
    };
    db.casters[idx] = updated;
    saveDb(db);
    res.json(updated);
  });

  // Caster: attach or update YouTube live stream link for assigned scrim
  app.put('/api/scrims/:id/stream-link', requireRoles('CASTER', 'SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const db = loadDb();
    const scrim = db.scrims.find((s) => s.id === req.params.id);
    if (!scrim) return res.status(404).json({ error: 'Sesi scrim tidak ditemukan' });

    if (authUser?.role === 'CASTER' && authUser.casterId && scrim.casterId !== authUser.casterId) {
      return res.status(403).json({
        error: 'Anda hanya dapat menambahkan link YouTube pada match yang ditugaskan kepada Anda.',
      });
    }

    const rawUrl = String(req.body.youtubeStreamUrl || '').trim();
    if (rawUrl) {
      let valid = false;
      try {
        const parsed = new URL(rawUrl);
        const host = parsed.hostname.toLowerCase();
        valid =
          (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
          (host === 'youtube.com' ||
            host === 'www.youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'youtu.be' ||
            host === 'studio.youtube.com');
      } catch {
        valid = false;
      }
      if (!valid) {
        return res.status(400).json({
          error: 'Link harus berupa URL YouTube yang valid (contoh: https://youtube.com/watch?v=... atau https://youtu.be/...).',
        });
      }
    }

    scrim.youtubeStreamUrl = rawUrl || undefined;
    saveDb(db);
    res.json(sanitizeScrimForRole(scrim, authUser));
  });

  // Caster: request withdrawal for confirmed scrim fees
  app.post(
    '/api/casters/:id/withdrawals',
    withdrawRateLimiter,
    requireRoles('CASTER', 'SUPER_ADMIN'),
    (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (authUser?.role === 'CASTER' && authUser.casterId && authUser.casterId !== req.params.id) {
      return res.status(403).json({ error: 'Anda hanya dapat mengajukan withdraw dari saldo Anda sendiri.' });
    }
    const db = loadDb();
    const caster = db.casters.find((c) => c.id === req.params.id);
    if (!caster) return res.status(404).json({ error: 'Shoutcaster tidak ditemukan.' });

    const amount = Math.round(Number(req.body.amount || 0));
    const bankOrWallet = String(req.body.bankOrWallet || '').trim();
    const accountNumber = String(req.body.accountNumber || '').trim();
    const accountName = String(req.body.accountName || '').trim();
    const note = String(req.body.note || '').trim();

    if (!amount || amount < 10000) {
      return res.status(400).json({ error: 'Minimal nominal withdraw adalah Rp 10.000.' });
    }
    if (!bankOrWallet || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'Bank/E-Wallet, nomor rekening, dan nama pemilik wajib diisi.' });
    }
    if (accountNumber.replace(/\D/g, '').length < 6) {
      return res.status(400).json({ error: 'Nomor rekening / e-wallet tidak valid (minimal 6 digit angka).' });
    }

    const confirmedEarnings = db.scrims
      .filter(
        (s) =>
          s.casterId === caster.id &&
          s.status === 'CONFIRMED' &&
          s.casterApprovalStatus === 'APPROVED'
      )
      .reduce((sum, s) => sum + s.casterRate, 0);

    const usedAmount = (db.withdrawals || [])
      .filter((w) => w.casterId === caster.id && w.status !== 'REJECTED')
      .reduce((sum, w) => sum + w.amount, 0);

    const availableBalance = Math.max(0, confirmedEarnings - usedAmount);
    if (amount > availableBalance) {
      return res.status(400).json({
        error: `Saldo tidak mencukupi. Saldo tersedia untuk ditarik: Rp ${availableBalance.toLocaleString('id-ID')}.`,
      });
    }

    const item: CasterWithdrawal = {
      id: makeId('wdr'),
      casterId: caster.id,
      casterName: caster.name,
      amount,
      bankOrWallet,
      accountNumber,
      accountName,
      note: note || undefined,
      status: 'PENDING',
      requestedAt: new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WIB',
    };

    db.withdrawals = [item, ...(db.withdrawals || [])];
    ensurePaymentRecords(db);
    saveDb(db);
    res.status(201).json(item);
  });

  // Super Admin: approve (PAID) or reject caster withdrawal
  app.post('/api/withdrawals/:id/status', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const wdr = (db.withdrawals || []).find((w) => w.id === req.params.id);
    if (!wdr) return res.status(404).json({ error: 'Data withdraw tidak ditemukan.' });
    const nextStatus = req.body.status === 'REJECTED' ? 'REJECTED' : 'PAID';
    wdr.status = nextStatus;
    wdr.processedAt =
      new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WIB';
    ensurePaymentRecords(db);
    saveDb(db);
    res.json(wdr);
  });

  // --- SUPER ADMIN DATA EXPORT ENDPOINTS ---
  const csvEscape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    let str = Array.isArray(value)
      ? value.join('; ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    // Neutralize CSV Formula Injection (Excel / Sheets DDE protection)
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const toCsvTable = (headers: string[], rows: unknown[][]): string => {
    const headerLine = headers.map(csvEscape).join(',');
    const bodyLines = rows.map((row) => row.map(csvEscape).join(','));
    return [headerLine, ...bodyLines].join('\r\n');
  };

  const buildDatasetCsv = (
    dataset: string,
    db: OrdalDatabase,
    publicUsers: AuthUser[]
  ): string => {
    switch (dataset) {
      case 'tournaments':
        return toCsvTable(
          [
            'ID',
            'Nama Turnamen',
            'Game',
            'Format',
            'Prize Pool',
            'Tim Terdaftar',
            'Maks Tim',
            'Tanggal Mulai',
            'Region',
            'Status',
            'Deskripsi',
          ],
          db.tournaments.map((t) => [
            t.id,
            t.name,
            t.game,
            t.format,
            t.prizePool,
            t.registeredTeams,
            t.maxTeams,
            t.startDate,
            t.region,
            t.status,
            t.description,
          ])
        );
      case 'scrims':
        return toCsvTable(
          [
            'ID',
            'Game',
            'Tanggal',
            'Slot Jam',
            'Mode',
            'Status',
            'Tim Host',
            'Roster Inti Host',
            'Roster Cadangan Host',
            'Tim Penantang',
            'Roster Inti Penantang',
            'Roster Cadangan Penantang',
            'Caster',
            'Approval Caster',
            'Tarif Caster',
            'Lobby Fee ORDAL',
            'Total Biaya',
            'Split Per Tim',
            'Host Lunas',
            'Penantang Lunas',
            'Skor Host',
            'Skor Penantang',
            'Pemenang',
            'Link Live YouTube',
            'Dibuat Pada',
          ],
          db.scrims.map((s) => [
            s.id,
            s.game,
            s.date,
            s.timeSlot,
            s.mode,
            s.status,
            s.hostTeamName,
            s.hostRosterCore,
            s.hostRosterSub,
            s.challengerTeamName,
            s.challengerRosterCore,
            s.challengerRosterSub,
            s.casterName,
            s.casterApprovalStatus,
            s.casterRate,
            s.platformFee,
            s.totalCost,
            s.splitCostPerTeam,
            s.hostPaid ? 'YA' : 'TIDAK',
            s.challengerPaid ? 'YA' : 'TIDAK',
            s.hostScore ?? '',
            s.challengerScore ?? '',
            s.winnerSide ?? '',
            s.youtubeStreamUrl ?? '',
            s.createdAt,
          ])
        );
      case 'casters':
        return toCsvTable(
          [
            'ID',
            'Nama',
            'Alias',
            'Verified',
            'Top Caster',
            'Game Spesialisasi',
            'Ratecard (IDR)',
            'Maks Match/Hari',
            'Tanggal Day Off',
            'Status',
            'Bio',
          ],
          db.casters.map((c) => [
            c.id,
            c.name,
            c.alias,
            c.isVerified ? 'YA' : 'TIDAK',
            c.isTopCaster ? 'YA' : 'TIDAK',
            c.specialtyGames,
            c.rateCard,
            c.maxMatchesPerDay,
            c.dayOffDates,
            c.status,
            c.bio,
          ])
        );
      case 'matches':
        return toCsvTable(
          [
            'ID',
            'ID Turnamen',
            'Game',
            'Ronde',
            'Urutan Bracket',
            'Tim A',
            'Tag A',
            'Skor A',
            'Tim B',
            'Tag B',
            'Skor B',
            'Map',
            'Status',
            'Pemenang',
            'MVP IGN',
            'Diperbarui Pada',
          ],
          db.matches.map((m) => [
            m.id,
            m.tournamentId,
            m.game,
            m.round,
            m.bracketOrder,
            m.teamA,
            m.teamATag,
            m.scoreA,
            m.teamB,
            m.teamBTag,
            m.scoreB,
            m.mapName,
            m.status,
            m.winnerTag ?? '',
            m.mvpIgn ?? '',
            m.updatedAt,
          ])
        );
      case 'squads':
        return toCsvTable(
          [
            'ID',
            'Nama Squad',
            'Tag',
            'ID Turnamen',
            'Kapten IGN',
            'Kontak Kapten',
            'Roster',
            'Seed',
            'Status Check-In',
            'Terdaftar Pada',
          ],
          db.squads.map((sq) => [
            sq.id,
            sq.name,
            sq.tag,
            sq.tournamentId,
            sq.captainIgn,
            sq.captainContact,
            sq.roster,
            sq.seed,
            sq.checkInStatus,
            sq.registeredAt,
          ])
        );
      case 'news':
        return toCsvTable(
          [
            'ID',
            'Judul',
            'Kategori',
            'Penulis',
            'Tanggal Terbit',
            'Waktu Baca',
            'Ringkasan',
            'Konten',
          ],
          db.news.map((n) => [
            n.id,
            n.title,
            n.category,
            n.author,
            n.publishedAt,
            n.readTime,
            n.excerpt,
            n.content,
          ])
        );
      case 'users':
        return toCsvTable(
          [
            'ID',
            'Email',
            'Nama Tampilan',
            'Role',
            'Caster ID',
            'Nama Tim',
            'Tag Tim',
            'Game Utama',
            'Kapten IGN',
            'Kontak Kapten',
            'Roster Inti',
            'Roster Cadangan',
          ],
          publicUsers.map((u) => [
            u.id,
            u.email,
            u.displayName,
            u.role,
            u.casterId ?? '',
            u.teamProfile?.teamName ?? '',
            u.teamProfile?.teamTag ?? '',
            u.teamProfile?.primaryGame ?? '',
            u.teamProfile?.captainIgn ?? '',
            u.teamProfile?.captainContact ?? '',
            u.teamProfile?.rosterCore ?? [],
            u.teamProfile?.rosterSub ?? [],
          ])
        );
      case 'withdrawals':
        return toCsvTable(
          [
            'ID',
            'Caster ID',
            'Nama Caster',
            'Nominal (IDR)',
            'Bank / E-Wallet',
            'Nomor Rekening',
            'Nama Pemilik',
            'Status',
            'Catatan',
            'Diajukan Pada',
            'Diproses Pada',
          ],
          (db.withdrawals || []).map((w) => [
            w.id,
            w.casterId,
            w.casterName,
            w.amount,
            w.bankOrWallet,
            w.accountNumber,
            w.accountName,
            w.status,
            w.note ?? '',
            w.requestedAt,
            w.processedAt ?? '',
          ])
        );
      case 'audit_logs':
        return toCsvTable(
          [
            'ID',
            'Waktu (ISO)',
            'Actor Email',
            'Actor Name',
            'Resource',
            'Action',
            'Target ID',
            'Target',
            'Ringkasan',
            'Field Diubah',
          ],
          (db.auditLogs || []).map((a) => [
            a.id,
            a.timestamp,
            a.actorEmail,
            a.actorName,
            a.resource,
            a.action,
            a.targetId,
            a.targetLabel,
            a.summary,
            a.changedFields ?? [],
          ])
        );
      default: {
        const sections: { title: string; key: string }[] = [
          { title: 'TOURNAMENTS', key: 'tournaments' },
          { title: 'SCRIM ALL GAME', key: 'scrims' },
          { title: 'SHOUTCASTERS', key: 'casters' },
          { title: 'WITHDRAW FEE CASTER', key: 'withdrawals' },
          { title: 'MATCHES & BRACKET', key: 'matches' },
          { title: 'ROSTER & SQUADS', key: 'squads' },
          { title: 'NEWS', key: 'news' },
          { title: 'USERS & TEAM PROFILES', key: 'users' },
          { title: 'AUDIT LOGS', key: 'audit_logs' },
        ];
        return sections
          .map((sec) => `=== ${sec.title} ===\r\n${buildDatasetCsv(sec.key, db, publicUsers)}`)
          .join('\r\n\r\n');
      }
    }
  };

  app.get('/api/admin/users', requireRoles('SUPER_ADMIN'), (_req, res) => {
    const store = loadAuthStore();
    res.json({ users: store.users.map(toPublicUser) });
  });

  // Super Admin ONLY: Provision, rotate password, and revoke League Ops operator accounts
  app.post('/api/admin/league-ops', requireRoles('SUPER_ADMIN'), writeRateLimiter, (req, res) => {
    const adminUser = getAuthenticatedUser(req);
    const displayName = String(req.body.displayName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!displayName) {
      return res.status(400).json({ error: 'Nama operator League Ops wajib diisi.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password minimal 8 karakter.' });
    }

    const store = loadAuthStore();
    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      return res.status(409).json({ error: `Email ${email} sudah terdaftar di sistem.` });
    }

    const newUser: StoredUser = {
      id: makeId('usr-lops'),
      email,
      displayName,
      role: 'LEAGUE_OPS',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    store.users.push(newUser);
    saveAuthStore(store);

    const db = loadDb();
    appendAuditLog(db, req, {
      resource: 'USER',
      action: 'CREATE',
      targetId: newUser.id,
      targetLabel: `${newUser.displayName} (${newUser.email})`,
      summary: `Membuat akun League Ops baru untuk manajemen turnamen: ${newUser.email}`,
    });
    saveDb(db);

    recordSocEvent({
      severity: 'LOW',
      category: 'POLICY_CHANGE',
      ip: getClientIp(req),
      method: 'POST',
      path: '/api/admin/league-ops',
      actorEmail: adminUser?.email,
      actorRole: 'SUPER_ADMIN',
      userAgent: String(req.headers['user-agent'] || ''),
      summary: `Akun League Ops baru dibuat (${newUser.email}) oleh ${adminUser?.email}.`,
      status: 'RESOLVED',
    });

    res.status(201).json({ user: toPublicUser(newUser) });
  });

  app.put('/api/admin/league-ops/:id/password', requireRoles('SUPER_ADMIN'), writeRateLimiter, (req, res) => {
    const adminUser = getAuthenticatedUser(req);
    const password = String(req.body.password || '');
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
    }

    const store = loadAuthStore();
    const idx = store.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Akun operator tidak ditemukan.' });
    }
    const target = store.users[idx];
    if (target.role !== 'LEAGUE_OPS') {
      return res.status(403).json({ error: 'Endpoint ini hanya untuk akun role League Ops.' });
    }

    target.passwordHash = hashPassword(password);
    let revokedSessions = 0;
    for (const [tokHash, sess] of Object.entries(store.sessions)) {
      if (sess.userId === target.id) {
        delete store.sessions[tokHash];
        revokedSessions += 1;
      }
    }
    saveAuthStore(store);

    const db = loadDb();
    appendAuditLog(db, req, {
      resource: 'USER',
      action: 'UPDATE',
      targetId: target.id,
      targetLabel: `${target.displayName} (${target.email})`,
      summary: `Reset password akun League Ops ${target.email} (${revokedSessions} sesi aktif dicabut)`,
      changedFields: ['passwordHash'],
    });
    saveDb(db);

    recordSocEvent({
      severity: 'LOW',
      category: 'POLICY_CHANGE',
      ip: getClientIp(req),
      method: 'PUT',
      path: `/api/admin/league-ops/${target.id}/password`,
      actorEmail: adminUser?.email,
      actorRole: 'SUPER_ADMIN',
      userAgent: String(req.headers['user-agent'] || ''),
      summary: `Password League Ops (${target.email}) direset oleh ${adminUser?.email}.`,
      status: 'RESOLVED',
    });

    res.json({ ok: true, user: toPublicUser(target) });
  });

  app.delete('/api/admin/league-ops/:id', requireRoles('SUPER_ADMIN'), (req, res) => {
    const adminUser = getAuthenticatedUser(req);
    const store = loadAuthStore();
    const target = store.users.find((u) => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Akun operator tidak ditemukan.' });
    }
    if (target.role !== 'LEAGUE_OPS') {
      return res.status(403).json({ error: 'Hanya akun role League Ops yang dapat dihapus melalui menu ini.' });
    }

    store.users = store.users.filter((u) => u.id !== target.id);
    for (const [tokHash, sess] of Object.entries(store.sessions)) {
      if (sess.userId === target.id) {
        delete store.sessions[tokHash];
      }
    }
    saveAuthStore(store);

    const db = loadDb();
    appendAuditLog(db, req, {
      resource: 'USER',
      action: 'DELETE',
      targetId: target.id,
      targetLabel: `${target.displayName} (${target.email})`,
      summary: `Menghapus & mencabut akses akun League Ops ${target.email}`,
    });
    saveDb(db);

    recordSocEvent({
      severity: 'MEDIUM',
      category: 'SESSION_REVOKED',
      ip: getClientIp(req),
      method: 'DELETE',
      path: `/api/admin/league-ops/${target.id}`,
      actorEmail: adminUser?.email,
      actorRole: 'SUPER_ADMIN',
      userAgent: String(req.headers['user-agent'] || ''),
      summary: `Akun League Ops (${target.email}) dihapus & sesi dicabut oleh ${adminUser?.email}.`,
      status: 'RESOLVED',
    });

    res.json({ deleted: true });
  });

  app.post('/api/admin/league-ops/:id/reset-2fa', requireRoles('SUPER_ADMIN'), (req, res) => {
    const adminUser = getAuthenticatedUser(req);
    const store = loadAuthStore();
    const target = store.users.find((u) => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Akun operator tidak ditemukan.' });
    }
    if (target.role !== 'LEAGUE_OPS') {
      return res.status(403).json({ error: 'Hanya akun League Ops yang dapat di-reset 2FA-nya di sini.' });
    }
    target.totpEnabled = false;
    delete target.totpSecret;
    delete target.totpPendingSecret;
    delete target.totpLastUsedStep;
    delete target.totpRecoveryHashes;
    for (const [tokHash, sess] of Object.entries(store.sessions)) {
      if (sess.userId === target.id) {
        delete store.sessions[tokHash];
      }
    }
    saveAuthStore(store);

    const db = loadDb();
    appendAuditLog(db, req, {
      resource: 'USER',
      action: 'UPDATE',
      targetId: target.id,
      targetLabel: `${target.displayName} (${target.email})`,
      summary: `Mereset 2FA Authenticator akun League Ops ${target.email} dan mencabut sesinya.`,
      changedFields: ['totpEnabled'],
    });
    saveDb(db);

    recordSocEvent({
      severity: 'MEDIUM',
      category: 'POLICY_CHANGE',
      ip: getClientIp(req),
      method: req.method,
      path: req.path,
      actorEmail: adminUser?.email,
      actorRole: 'SUPER_ADMIN',
      summary: `2FA League Ops (${target.email}) direset oleh ${adminUser?.email}.`,
      status: 'RESOLVED',
    });

    res.json({ ok: true, user: toPublicUser(target) });
  });

  app.get('/api/admin/audit-logs', requireRoles('SUPER_ADMIN'), (_req, res) => {
    const db = loadDb();
    const logs = db.auditLogs || [];
    res.json({
      auditLogs: logs,
      integrity: verifyAuditLogChain(logs),
    });
  });

  app.get('/api/admin/game-analytics', requireRoles('SUPER_ADMIN'), (req, res) => {
    const db = loadDb();
    const canonicalGame = (raw?: string): string => {
      const upper = String(raw || '').trim().toUpperCase();
      if (upper === 'E-FOOTBALL' || upper === 'EFOOTBALL') return 'EFOOTBALL';
      if (upper === 'FF' || upper === 'FREE FIRE') return 'FREE FIRE';
      if (upper === 'PB' || upper === 'POINT BLANK') return 'POINT BLANK';
      return upper || 'LAINNYA';
    };
    const parseRupiah = (raw?: string): number => {
      const str = String(raw || '').trim();
      if (!str || /gratis|free/i.test(str)) return 0;
      const digits = str.replace(/[^\d]/g, '');
      return digits ? Number(digits) : 0;
    };

    const gameSet = new Set<string>([
      'POINT BLANK',
      'FREE FIRE',
      'EFOOTBALL',
    ]);
    for (const t of db.tournaments) gameSet.add(canonicalGame(t.game));
    for (const s of db.scrims) gameSet.add(canonicalGame(s.game));
    for (const m of db.matches) gameSet.add(canonicalGame(m.game));

    const tournamentGameById = new Map<string, string>();
    for (const t of db.tournaments) {
      tournamentGameById.set(t.id, canonicalGame(t.game));
    }

    const byGameMap = new Map<
      string,
      {
        game: string;
        tournamentsCount: number;
        squadsCount: number;
        tournamentMatchesCount: number;
        liveMatchesCount: number;
        scrimsCount: number;
        confirmedScrimsCount: number;
        cancelledScrimsCount: number;
        scrimCompletionRate: number;
        totalPrizePool: number;
        lobbyFeeIncome: number;
        casterFeeVolume: number;
        tournamentFeeIncome: number;
        netOrdalIncome: number;
        grossIncome: number;
        refundedCount: number;
        refundedAmount: number;
      }
    >();

    const ensureRow = (game: string) => {
      let row = byGameMap.get(game);
      if (!row) {
        row = {
          game,
          tournamentsCount: 0,
          squadsCount: 0,
          tournamentMatchesCount: 0,
          liveMatchesCount: 0,
          scrimsCount: 0,
          confirmedScrimsCount: 0,
          cancelledScrimsCount: 0,
          scrimCompletionRate: 0,
          totalPrizePool: 0,
          lobbyFeeIncome: 0,
          casterFeeVolume: 0,
          tournamentFeeIncome: 0,
          netOrdalIncome: 0,
          grossIncome: 0,
          refundedCount: 0,
          refundedAmount: 0,
        };
        byGameMap.set(game, row);
      }
      return row;
    };

    for (const g of gameSet) ensureRow(g);

    for (const t of db.tournaments) {
      const row = ensureRow(canonicalGame(t.game));
      row.tournamentsCount += 1;
      row.totalPrizePool += parseRupiah(t.prizePool);
      const regFee = parseRupiah(t.registrationFee);
      if (regFee > 0) {
        row.tournamentFeeIncome += regFee * Math.max(0, Number(t.registeredTeams) || 0);
      }
    }

    for (const sq of db.squads) {
      const g = tournamentGameById.get(sq.tournamentId) || 'POINT BLANK';
      const row = ensureRow(g);
      row.squadsCount += 1;
    }

    for (const m of db.matches) {
      const row = ensureRow(canonicalGame(m.game));
      row.tournamentMatchesCount += 1;
      if (m.status === 'LIVE') row.liveMatchesCount += 1;
    }

    for (const sc of db.scrims) {
      const row = ensureRow(canonicalGame(sc.game));
      row.scrimsCount += 1;
      if (sc.status === 'CANCELLED') {
        row.cancelledScrimsCount += 1;
      } else if (sc.status === 'CONFIRMED') {
        row.confirmedScrimsCount += 1;
        row.lobbyFeeIncome += sc.platformFee || PLATFORM_LOBBY_FEE;
        row.casterFeeVolume += sc.casterRate || 0;
      } else if (sc.status === 'PARTIALLY_PAID') {
        row.lobbyFeeIncome += Math.round((sc.platformFee || PLATFORM_LOBBY_FEE) / 2);
        row.casterFeeVolume += Math.round((sc.casterRate || 0) / 2);
      }
      if (Array.isArray(sc.refundRequests)) {
        for (const r of sc.refundRequests) {
          row.refundedCount += 1;
          row.refundedAmount += Number(r.amount) || 0;
        }
      }
    }

    const allRows = Array.from(byGameMap.values())
      .map((row) => {
        const netOrdalIncome = row.lobbyFeeIncome + row.tournamentFeeIncome;
        const grossIncome = netOrdalIncome + row.casterFeeVolume;
        const scrimCompletionRate =
          row.scrimsCount > 0 ? Math.round((row.confirmedScrimsCount / row.scrimsCount) * 100) : 0;
        return {
          ...row,
          netOrdalIncome,
          grossIncome,
          scrimCompletionRate,
        };
      })
      .filter(
        (r) =>
          r.tournamentsCount > 0 ||
          r.squadsCount > 0 ||
          r.tournamentMatchesCount > 0 ||
          r.scrimsCount > 0
      )
      .sort((a, b) => b.grossIncome - a.grossIncome || b.scrimsCount - a.scrimsCount);

    const requestedGameRaw = String(req.query.game || 'ALL').trim().toUpperCase();
    const selectedGame = requestedGameRaw === 'ALL' ? 'ALL' : canonicalGame(requestedGameRaw);
    const filteredRows =
      selectedGame === 'ALL' ? allRows : allRows.filter((r) => r.game === selectedGame);

    const summary = filteredRows.reduce(
      (acc, r) => ({
        tournamentsCount: acc.tournamentsCount + r.tournamentsCount,
        squadsCount: acc.squadsCount + r.squadsCount,
        tournamentMatchesCount: acc.tournamentMatchesCount + r.tournamentMatchesCount,
        liveMatchesCount: acc.liveMatchesCount + r.liveMatchesCount,
        scrimsCount: acc.scrimsCount + r.scrimsCount,
        confirmedScrimsCount: acc.confirmedScrimsCount + r.confirmedScrimsCount,
        cancelledScrimsCount: acc.cancelledScrimsCount + r.cancelledScrimsCount,
        scrimCompletionRate: 0,
        totalPrizePool: acc.totalPrizePool + r.totalPrizePool,
        lobbyFeeIncome: acc.lobbyFeeIncome + r.lobbyFeeIncome,
        casterFeeVolume: acc.casterFeeVolume + r.casterFeeVolume,
        tournamentFeeIncome: acc.tournamentFeeIncome + r.tournamentFeeIncome,
        netOrdalIncome: acc.netOrdalIncome + r.netOrdalIncome,
        grossIncome: acc.grossIncome + r.grossIncome,
        refundedCount: acc.refundedCount + r.refundedCount,
        refundedAmount: acc.refundedAmount + r.refundedAmount,
      }),
      {
        tournamentsCount: 0,
        squadsCount: 0,
        tournamentMatchesCount: 0,
        liveMatchesCount: 0,
        scrimsCount: 0,
        confirmedScrimsCount: 0,
        cancelledScrimsCount: 0,
        scrimCompletionRate: 0,
        totalPrizePool: 0,
        lobbyFeeIncome: 0,
        casterFeeVolume: 0,
        tournamentFeeIncome: 0,
        netOrdalIncome: 0,
        grossIncome: 0,
        refundedCount: 0,
        refundedAmount: 0,
      }
    );
    summary.scrimCompletionRate =
      summary.scrimsCount > 0
        ? Math.round((summary.confirmedScrimsCount / summary.scrimsCount) * 100)
        : 0;

    res.json({
      selectedGame,
      availableGames: allRows.map((r) => r.game),
      summary,
      byGame: filteredRows,
    });
  });

  app.get('/api/admin/export', requireRoles('SUPER_ADMIN', 'LEAGUE_OPS'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const dataset = String(req.query.dataset || 'all').toLowerCase();
    const format = String(req.query.format || 'json').toLowerCase();
    const validDatasets = [
      'all',
      'tournaments',
      'scrims',
      'casters',
      'withdrawals',
      'matches',
      'squads',
      'news',
      'users',
      'audit_logs',
    ];

    if (
      authUser?.role === 'LEAGUE_OPS' &&
      !['tournaments', 'matches', 'squads'].includes(dataset)
    ) {
      recordSocEvent({
        severity: 'MEDIUM',
        category: 'RBAC_VIOLATION',
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
        actorEmail: authUser.email,
        actorRole: authUser.role,
        userAgent: String(req.headers['user-agent'] || ''),
        summary: `League Ops (${authUser.email}) mencoba ekspor dataset di luar izin (${dataset}).`,
      });
      return res.status(403).json({
        error: 'Role League Ops hanya diizinkan mengekspor data Turnamen, Match, dan Squad.',
      });
    }

    if (!validDatasets.includes(dataset)) {
      return res.status(400).json({ error: 'Dataset export tidak valid.' });
    }
    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({ error: 'Format export harus json atau csv.' });
    }

    const db = loadDb();
    const authStore = loadAuthStore();
    const publicUsers = authStore.users.map(toPublicUser);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `ordal-${dataset}-${dateStamp}.${format}`;

    if (format === 'csv') {
      const csvContent = '\uFEFF' + buildDatasetCsv(dataset, db, publicUsers);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvContent);
    }

    const exportedAt = new Date().toISOString();
    const exportedBy = authUser?.email || 'super-admin';
    const resolvedRecords =
      dataset === 'users'
        ? publicUsers
        : dataset === 'audit_logs'
          ? db.auditLogs || []
          : db[dataset as keyof OrdalDatabase];
    const payload =
      dataset === 'all'
        ? {
            exportedAt,
            exportedBy,
            platform: 'ORDAL Esports Hub',
            summary: {
              tournaments: db.tournaments.length,
              scrims: db.scrims.length,
              casters: db.casters.length,
              withdrawals: (db.withdrawals || []).length,
              matches: db.matches.length,
              squads: db.squads.length,
              news: db.news.length,
              users: publicUsers.length,
              auditLogs: (db.auditLogs || []).length,
            },
            data: {
              ...db,
              users: publicUsers,
            },
          }
        : {
            exportedAt,
            exportedBy,
            platform: 'ORDAL Esports Hub',
            dataset,
            count: Array.isArray(resolvedRecords) ? resolvedRecords.length : 0,
            records: resolvedRecords,
          };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(payload, null, 2));
  });

  // --- SUPER ADMIN SOC (SECURITY OPERATIONS CENTER) ENDPOINTS ---
  app.get('/api/soc/overview', requireRoles('SUPER_ADMIN'), (req, res) => {
    const authStore = loadAuthStore();
    const db = loadDb();
    const currentCtx = resolveAuthContext(req);
    const currentUser = currentCtx?.user || null;
    const currentTokenHash = currentCtx?.tokenHash || '';
    const now = Date.now();
    const activeSessions: SocActiveSession[] = [];
    for (const [tokHash, sess] of Object.entries(authStore.sessions)) {
      const absExpiresAt = sess.expiresAt;
      const idleExpiresAt = sess.lastActivityAt + INACTIVITY_TIMEOUT_MS;
      const effectiveExpiresAt = Math.min(absExpiresAt, idleExpiresAt);
      if (effectiveExpiresAt <= now) continue;
      const u = authStore.users.find((item) => item.id === sess.userId);
      if (!u) continue;
      activeSessions.push({
        tokenPrefix: `sha256:${tokHash.slice(0, 8)}...`,
        userId: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        expiresAt: new Date(effectiveExpiresAt).toISOString(),
        isCurrent: tokHash === currentTokenHash,
      });
    }

    const auditIntegrity = verifyAuditLogChain(db.auditLogs || []);
    const leagueOpsUsers = authStore.users.filter((u) => u.role === 'LEAGUE_OPS');
    const leagueOpsMfaCount = leagueOpsUsers.filter((u) => Boolean(u.totpEnabled && u.totpSecret)).length;
    const hasEmailProvider = Boolean(
      getConfiguredEnvSecret('RESEND_API_KEY') && getConfiguredEnvSecret('EMAIL_FROM')
    );
    const hasTurnstile = Boolean(getConfiguredEnvSecret('TURNSTILE_SECRET_KEY'));
    const hasSocWebhook = Boolean(getConfiguredEnvSecret('SOC_ALERT_WEBHOOK_URL'));
    const hasPgProd =
      PAYMENT_GATEWAY_PROVIDER_MODE !== 'SANDBOX' &&
      Boolean(getConfiguredEnvSecret('PAYMENT_GATEWAY_WEBHOOK_SECRET')) &&
      getConfiguredEnvSecret('PAYMENT_ALLOW_SANDBOX') === 'false';
    const hasWebhookIpAllowlist = Boolean(
      getConfiguredEnvSecret('PAYMENT_GATEWAY_WEBHOOK_IP_ALLOWLIST')
    );

    const productionChecklist: ProductionSecurityCheck[] = [
      {
        id: 'admin-mfa',
        label: '2FA Authenticator Super Admin',
        status: currentUser?.totpEnabled && currentUser?.totpSecret ? 'READY' : 'ACTION_REQUIRED',
        detail:
          currentUser?.totpEnabled && currentUser?.totpSecret
            ? 'Aktif (TOTP RFC 6238 + 6 Recovery Code terenkripsi).'
            : 'Belum diaktifkan. Aktifkan di panel Setup 2FA di bawah untuk perlindungan akun penuh.',
      },
      {
        id: 'league-ops-mfa',
        label: '2FA Operator League Ops',
        status:
          leagueOpsUsers.length === 0
            ? 'READY'
            : leagueOpsMfaCount === leagueOpsUsers.length
              ? 'READY'
              : 'OPTIONAL',
        detail:
          leagueOpsUsers.length === 0
            ? 'Belum ada akun League Ops tambahan.'
            : `${leagueOpsMfaCount}/${leagueOpsUsers.length} operator mengaktifkan 2FA Authenticator.`,
      },
      {
        id: 'audit-chain',
        label: 'Tamper-Evident Audit Hash Chain',
        status: auditIntegrity.valid ? 'READY' : 'ACTION_REQUIRED',
        detail: auditIntegrity.valid
          ? `Rantai SHA-256 valid (${auditIntegrity.hashedLogs}/${auditIntegrity.totalLogs} log terverifikasi).`
          : `Terdeteksi ketidaksesuaian hash pada log ${auditIntegrity.brokenAtId}.`,
      },
      {
        id: 'payment-prod',
        label: 'Mode Payment Gateway Produksi',
        status: hasPgProd ? 'READY' : 'ACTION_REQUIRED',
        detail: hasPgProd
          ? `Mode ${PAYMENT_GATEWAY_PROVIDER_MODE} aktif dan sandbox dinonaktifkan.`
          : `Saat ini masih mode ${PAYMENT_GATEWAY_PROVIDER_MODE} (Sandbox aktif). Matikan sebelum menerima uang asli.`,
        envVar: 'PAYMENT_GATEWAY_PROVIDER, PAYMENT_ALLOW_SANDBOX=false',
      },
      {
        id: 'email-otp',
        label: 'Pengiriman Email OTP (Resend API)',
        status: hasEmailProvider ? 'READY' : 'ACTION_REQUIRED',
        detail: hasEmailProvider
          ? 'Resend API terhubung untuk mengirim kode reset password.'
          : 'Belum terhubung. Kode reset password hanya tercatat di log server.',
        envVar: 'RESEND_API_KEY, EMAIL_FROM',
      },
      {
        id: 'turnstile',
        label: 'Anti-Bot CAPTCHA (Turnstile)',
        status: hasTurnstile ? 'READY' : 'OPTIONAL',
        detail: hasTurnstile
          ? 'Cloudflare Turnstile aktif pada registrasi tim, lupa password, & daftar squad.'
          : 'Opsional: tambahkan key untuk proteksi anti-bot tambahan di luar rate limiter.',
        envVar: 'TURNSTILE_SECRET_KEY, VITE_TURNSTILE_SITE_KEY',
      },
      {
        id: 'soc-webhook',
        label: 'Alert Webhook Real-Time SOC',
        status: hasSocWebhook ? 'READY' : 'OPTIONAL',
        detail: hasSocWebhook
          ? 'Insiden HIGH/CRITICAL otomatis dikirim ke endpoint webhook.'
          : 'Opsional: arahkan ke webhook Discord/Slack/SIEM tim keamanan.',
        envVar: 'SOC_ALERT_WEBHOOK_URL',
      },
      {
        id: 'pg-allowlist',
        label: 'Webhook IP Allowlist',
        status: hasWebhookIpAllowlist ? 'READY' : 'OPTIONAL',
        detail: hasWebhookIpAllowlist
          ? 'Callback /api/payments/webhook dibatasi ke IP allowlist resmi.'
          : 'Opsional: batasi callback payment gateway hanya dari IP resmi Midtrans/Xendit.',
        envVar: 'PAYMENT_GATEWAY_WEBHOOK_IP_ALLOWLIST',
      },
      {
        id: 'strict-csp',
        label: 'Strict Production CSP & Framing',
        status: strictHeadersMode ? 'READY' : 'OPTIONAL',
        detail: strictHeadersMode
          ? 'Strict CSP (tanpa unsafe-eval/inline script) & pembatasan iframe aktif.'
          : 'Mode preview iframe aktif agar preview AI Studio tetap berjalan mulus.',
        envVar: 'STRICT_PRODUCTION_HEADERS=true',
      },
    ];

    res.json(
      buildSocOverview(activeSessions, {
        productionChecklist,
        auditIntegrity,
      })
    );
  });

  app.post('/api/soc/events/:id/status', requireRoles('SUPER_ADMIN'), (req, res) => {
    const nextStatus = String(req.body.status || '').toUpperCase() as SocEventStatus;
    if (!['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Status insiden tidak valid.' });
    }
    const updated = updateSocEventStatus(req.params.id, nextStatus);
    if (!updated) {
      return res.status(404).json({ error: 'Insiden SOC tidak ditemukan.' });
    }
    res.json(updated);
  });

  app.post('/api/soc/block-ip', requireRoles('SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const ip = String(req.body.ip || '').trim();
    const reason = String(req.body.reason || 'Diblokir manual oleh Super Admin SOC').trim();
    const durationRaw = req.body.durationMinutes;
    const durationMinutes =
      durationRaw === null || durationRaw === undefined || durationRaw === ''
        ? null
        : Math.max(5, Math.min(43200, Math.round(Number(durationRaw) || 60)));

    if (!ip || ip.length < 3 || ip.length > 64) {
      return res.status(400).json({ error: 'Alamat IP tidak valid.' });
    }
    if (isLoopbackIp(ip)) {
      return res.status(400).json({
        error: 'IP lokal (127.0.0.1 / ::1) dilindungi agar Super Admin tidak terkunci dari server.',
      });
    }

    const entry = blockIpAddress({
      ip,
      reason,
      blockedBy: authUser?.email || 'Super Admin',
      durationMinutes,
      autoBlocked: false,
    });
    recordSocEvent({
      severity: 'HIGH',
      category: 'IP_BLOCKED',
      ip,
      method: 'POST',
      path: '/api/soc/block-ip',
      actorEmail: authUser?.email,
      actorRole: 'SUPER_ADMIN',
      summary: `IP ${ip} diblokir manual oleh ${authUser?.email || 'Super Admin'}.`,
      details: `${reason} (${durationMinutes ? `${durationMinutes} menit` : 'Permanen'})`,
      status: 'RESOLVED',
    });
    res.status(201).json(entry);
  });

  app.delete('/api/soc/block-ip/:ip', requireRoles('SUPER_ADMIN'), (req, res) => {
    const ip = decodeURIComponent(req.params.ip || '');
    const removed = unblockIpAddress(ip);
    if (!removed) {
      return res.status(404).json({ error: 'IP tidak ditemukan di daftar blokir.' });
    }
    res.json({ unblocked: true });
  });

  app.put('/api/soc/policy', requireRoles('SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const updated = updateSocPolicy(req.body || {}, authUser?.email || 'Super Admin', getClientIp(req));
    res.json(updated);
  });

  app.post('/api/soc/revoke-all-sessions', requireRoles('SUPER_ADMIN'), (req, res) => {
    const authCtx = resolveAuthContext(req);
    const authUser = authCtx?.user || null;
    const currentTokenHash = authCtx?.tokenHash || '';
    const authStore = loadAuthStore();
    let revokedCount = 0;
    for (const tokHash of Object.keys(authStore.sessions)) {
      if (tokHash !== currentTokenHash) {
        delete authStore.sessions[tokHash];
        revokedCount += 1;
      }
    }
    saveAuthStore(authStore);
    recordSocEvent({
      severity: 'HIGH',
      category: 'SESSION_REVOKED',
      ip: getClientIp(req),
      method: 'POST',
      path: '/api/soc/revoke-all-sessions',
      actorEmail: authUser?.email,
      actorRole: 'SUPER_ADMIN',
      summary: `Emergency Kill Switch: ${revokedCount} sesi aktif lain dicabut oleh Super Admin.`,
      status: 'RESOLVED',
    });
    res.json({ revokedCount });
  });

  app.post('/api/soc/simulate-test', requireRoles('SUPER_ADMIN'), (req, res) => {
    const authUser = getAuthenticatedUser(req);
    const event = recordSocEvent({
      severity: 'HIGH',
      category: 'WAF_BLOCK',
      ip: '203.0.113.42',
      method: 'POST',
      path: '/api/tournaments?probe=UNION+SELECT',
      actorEmail: authUser?.email,
      actorRole: 'SUPER_ADMIN',
      summary: '[SOC SELF-TEST] Simulasi deteksi SQL Injection & WAF Alert berhasil diverifikasi.',
      details: 'Ini adalah pengujian aman dari Super Admin SOC Command Center (tidak berdampak ke data produksi).',
      status: 'OPEN',
    });
    res.json({
      event,
      message: 'Simulasi insiden SOC berhasil dicatat. Sensor WAF & alerting aktif.',
    });
  });

  // Vite middleware for dev or static dist for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ORDAL Esports Hub server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
