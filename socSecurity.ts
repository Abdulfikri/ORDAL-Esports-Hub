import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';
import type {
  AuditIntegrityReport,
  ProductionSecurityCheck,
  SocActiveSession,
  SocBlockedIp,
  SocCategory,
  SocEvent,
  SocEventStatus,
  SocOverviewResponse,
  SocPolicy,
  SocSeverity,
  UserRole,
} from './src/types';

interface SocStore {
  events: SocEvent[];
  blockedIps: SocBlockedIp[];
  policy: SocPolicy;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SOC_FILE = path.join(DATA_DIR, 'soc.json');
const MAX_SOC_EVENTS = 500;

const DEFAULT_SOC_POLICY: SocPolicy = {
  wafEnabled: true,
  autoBlockEnabled: true,
  bruteForceThreshold: 5,
  autoBlockDurationMinutes: 30,
  strictApiHeaders: true,
  alertOnRbacViolation: true,
};

// In-memory rolling failure windows for brute-force & WAF strike tracking
const loginFailureBuckets = new Map<string, number[]>();
const wafStrikeBuckets = new Map<string, number[]>();

export function getClientIp(req: express.Request): string {
  // Rely on Express req.ip (governed by app.set('trust proxy', 1)) to prevent X-Forwarded-For spoofing
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return String(raw).replace(/^::ffff:/, '');
}

export function isLoopbackIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadSocStore(): SocStore {
  ensureDataDir();
  if (!fs.existsSync(SOC_FILE)) {
    const initial: SocStore = {
      events: [
        {
          id: `soc-${crypto.randomBytes(4).toString('hex')}`,
          timestamp: new Date().toISOString(),
          severity: 'LOW',
          category: 'POLICY_CHANGE',
          ip: 'system',
          method: 'SYSTEM',
          path: '/soc/init',
          summary: 'SOC Security Patch diaktifkan (WAF, Brute-Force Guard, IP Blocklist & RBAC Monitor).',
          status: 'RESOLVED',
        },
      ],
      blockedIps: [],
      policy: { ...DEFAULT_SOC_POLICY },
    };
    saveSocStore(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(SOC_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SocStore>;
    const now = Date.now();
    const activeBlocked = Array.isArray(parsed.blockedIps)
      ? parsed.blockedIps.filter((b) => !b.expiresAt || new Date(b.expiresAt).getTime() > now)
      : [];
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      blockedIps: activeBlocked,
      policy: {
        ...DEFAULT_SOC_POLICY,
        ...(parsed.policy || {}),
      },
    };
  } catch {
    return {
      events: [],
      blockedIps: [],
      policy: { ...DEFAULT_SOC_POLICY },
    };
  }
}

export function saveSocStore(store: SocStore) {
  ensureDataDir();
  const tmpFile = `${SOC_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpFile, SOC_FILE);
  try {
    fs.chmodSync(SOC_FILE, 0o600);
  } catch {
    // ignore on filesystems without POSIX chmod
  }
}

async function dispatchSocWebhookAlert(event: SocEvent): Promise<void> {
  if (event.severity !== 'HIGH' && event.severity !== 'CRITICAL') return;
  const rawUrl = (process.env.SOC_ALERT_WEBHOOK_URL || '').trim();
  const lower = rawUrl.toLowerCase();
  if (
    !rawUrl ||
    lower === 'secret value' ||
    lower === 'your_secret_here' ||
    lower === 'placeholder' ||
    rawUrl.startsWith('CHANGE_ME_') ||
    rawUrl.startsWith('MY_')
  ) {
    return;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && !isLoopbackIp(parsed.hostname)) {
      return;
    }
    await fetch(parsed.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ORDAL-SOC-Alert/1.0',
      },
      body: JSON.stringify({
        text: `[ORDAL SOC ${event.severity}] ${event.category}: ${event.summary}`,
        source: 'ORDAL_SOC',
        event,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Never break request lifecycle if external webhook is unreachable
  }
}

export function recordSocEvent(params: {
  severity: SocSeverity;
  category: SocCategory;
  ip: string;
  method: string;
  path: string;
  actorEmail?: string;
  actorRole?: UserRole;
  userAgent?: string;
  summary: string;
  details?: string;
  status?: SocEventStatus;
}): SocEvent {
  const store = loadSocStore();
  const event: SocEvent = {
    id: `soc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    severity: params.severity,
    category: params.category,
    ip: params.ip || 'unknown',
    method: params.method,
    path: params.path,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    userAgent: params.userAgent ? params.userAgent.slice(0, 180) : undefined,
    summary: params.summary,
    details: params.details ? params.details.slice(0, 320) : undefined,
    status: params.status || 'OPEN',
  };
  store.events.unshift(event);
  if (store.events.length > MAX_SOC_EVENTS) {
    store.events = store.events.slice(0, MAX_SOC_EVENTS);
  }
  saveSocStore(store);
  void dispatchSocWebhookAlert(event);
  return event;
}

export function blockIpAddress(params: {
  ip: string;
  reason: string;
  blockedBy: string;
  durationMinutes?: number | null;
  autoBlocked?: boolean;
}): SocBlockedIp {
  const store = loadSocStore();
  const cleanIp = params.ip.trim().replace(/^::ffff:/, '');
  const now = new Date();
  const expiresAt =
    params.durationMinutes && params.durationMinutes > 0
      ? new Date(now.getTime() + params.durationMinutes * 60 * 1000).toISOString()
      : null;

  const existingIdx = store.blockedIps.findIndex((b) => b.ip === cleanIp);
  const entry: SocBlockedIp = {
    ip: cleanIp,
    reason: params.reason.slice(0, 200),
    blockedAt: now.toISOString(),
    expiresAt,
    blockedBy: params.blockedBy,
    autoBlocked: Boolean(params.autoBlocked),
    hits: existingIdx !== -1 ? store.blockedIps[existingIdx].hits : 0,
  };

  if (existingIdx !== -1) {
    store.blockedIps[existingIdx] = entry;
  } else {
    store.blockedIps.unshift(entry);
  }
  saveSocStore(store);
  return entry;
}

export function unblockIpAddress(ip: string): boolean {
  const store = loadSocStore();
  const cleanIp = ip.trim().replace(/^::ffff:/, '');
  const before = store.blockedIps.length;
  store.blockedIps = store.blockedIps.filter((b) => b.ip !== cleanIp);
  if (store.blockedIps.length !== before) {
    saveSocStore(store);
    return true;
  }
  return false;
}

export function updateSocEventStatus(eventId: string, status: SocEventStatus): SocEvent | null {
  const store = loadSocStore();
  const idx = store.events.findIndex((e) => e.id === eventId);
  if (idx === -1) return null;
  store.events[idx] = { ...store.events[idx], status };
  saveSocStore(store);
  return store.events[idx];
}

export function updateSocPolicy(patch: Partial<SocPolicy>, actorEmail: string, ip: string): SocPolicy {
  const store = loadSocStore();
  const next: SocPolicy = {
    wafEnabled: patch.wafEnabled !== undefined ? Boolean(patch.wafEnabled) : store.policy.wafEnabled,
    autoBlockEnabled:
      patch.autoBlockEnabled !== undefined ? Boolean(patch.autoBlockEnabled) : store.policy.autoBlockEnabled,
    bruteForceThreshold:
      patch.bruteForceThreshold !== undefined
        ? Math.min(20, Math.max(3, Math.round(Number(patch.bruteForceThreshold) || 5)))
        : store.policy.bruteForceThreshold,
    autoBlockDurationMinutes:
      patch.autoBlockDurationMinutes !== undefined
        ? Math.min(1440, Math.max(5, Math.round(Number(patch.autoBlockDurationMinutes) || 30)))
        : store.policy.autoBlockDurationMinutes,
    strictApiHeaders:
      patch.strictApiHeaders !== undefined ? Boolean(patch.strictApiHeaders) : store.policy.strictApiHeaders,
    alertOnRbacViolation:
      patch.alertOnRbacViolation !== undefined
        ? Boolean(patch.alertOnRbacViolation)
        : store.policy.alertOnRbacViolation,
  };
  store.policy = next;
  saveSocStore(store);
  recordSocEvent({
    severity: 'LOW',
    category: 'POLICY_CHANGE',
    ip,
    method: 'PUT',
    path: '/api/soc/policy',
    actorEmail,
    actorRole: 'SUPER_ADMIN',
    summary: `Kebijakan SOC diperbarui (WAF: ${next.wafEnabled ? 'ON' : 'OFF'}, Auto-Block: ${next.autoBlockEnabled ? 'ON' : 'OFF'}, Threshold: ${next.bruteForceThreshold}x).`,
    status: 'RESOLVED',
  });
  return next;
}

// Track failed login attempts & auto-ban on brute-force threshold
export function handleSocLoginFailure(req: express.Request, email: string): { autoBlocked: boolean } {
  const ip = getClientIp(req);
  const store = loadSocStore();
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const bucketKey = `${ip}`;
  const recent = (loginFailureBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
  recent.push(now);
  loginFailureBuckets.set(bucketKey, recent);

  const threshold = store.policy.bruteForceThreshold || 5;
  if (recent.length >= threshold) {
    const shouldBlock = store.policy.autoBlockEnabled && !isLoopbackIp(ip);
    recordSocEvent({
      severity: 'CRITICAL',
      category: 'BRUTE_FORCE',
      ip,
      method: req.method,
      path: req.path,
      actorEmail: email,
      userAgent: String(req.headers['user-agent'] || ''),
      summary: `Deteksi Brute-Force Login (${recent.length}x gagal dalam 10 menit) untuk akun ${email}.`,
      details: shouldBlock
        ? `IP ${ip} otomatis diblokir selama ${store.policy.autoBlockDurationMinutes} menit.`
        : 'Auto-block tidak diterapkan (mode nonaktif atau loopback lokal).',
    });
    if (shouldBlock) {
      blockIpAddress({
        ip,
        reason: `Auto-Ban: Brute-force login (${recent.length}x gagal pada ${email})`,
        blockedBy: 'SOC Auto-Defense',
        durationMinutes: store.policy.autoBlockDurationMinutes,
        autoBlocked: true,
      });
      return { autoBlocked: true };
    }
    return { autoBlocked: false };
  }

  recordSocEvent({
    severity: recent.length >= 3 ? 'MEDIUM' : 'LOW',
    category: 'AUTH_FAILURE',
    ip,
    method: req.method,
    path: req.path,
    actorEmail: email,
    userAgent: String(req.headers['user-agent'] || ''),
    summary: `Login gagal (${recent.length}/${threshold}) untuk email ${email}.`,
  });
  return { autoBlocked: false };
}

export function clearSocLoginFailures(req: express.Request) {
  const ip = getClientIp(req);
  loginFailureBuckets.delete(ip);
}

// --- WAF Signature Detection ---
interface WafRule {
  name: string;
  severity: SocSeverity;
  pattern: RegExp;
}

const WAF_RULES: WafRule[] = [
  {
    name: 'XSS Script Injection',
    severity: 'HIGH',
    pattern: /<\s*script\b|javascript\s*:|on(?:error|load|mouseover|focus)\s*=|<\s*iframe\b/i,
  },
  {
    name: 'SQL Injection Probe',
    severity: 'CRITICAL',
    pattern: /\b(?:union\s+all\s+select|union\s+select|drop\s+table|insert\s+into\s+\w+|delete\s+from\s+\w+)\b|(?:'|")\s*or\s+['"]?1['"]?\s*=\s*['"]?1/i,
  },
  {
    name: 'NoSQL Operator Injection',
    severity: 'HIGH',
    pattern: /"\$(?:where|ne|gt|lt|regex|exists|expr)"/i,
  },
  {
    name: 'Path Traversal / LFI',
    severity: 'CRITICAL',
    pattern: /(?:\.\.[/\\]){2,}|\/etc\/passwd|\/proc\/self\/environ|\.\.%2f/i,
  },
  {
    name: 'Prototype Pollution Attempt',
    severity: 'CRITICAL',
    pattern: /"__proto__"|"constructor"\s*:\s*\{\s*"prototype"/i,
  },
];

function inspectValueForWaf(value: unknown, depth = 0): { rule: WafRule; sample: string } | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === 'string') {
    // Skip safe base64 image data URIs (news thumbnails / team logos)
    if (value.startsWith('data:image/')) return null;
    const sample = value.slice(0, 1000);
    for (const rule of WAF_RULES) {
      if (rule.pattern.test(sample)) {
        return { rule, sample: sample.slice(0, 120) };
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) {
      const hit = inspectValueForWaf(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries.slice(0, 60)) {
      if (k === '__proto__' || k === 'prototype') {
        return { rule: WAF_RULES[4], sample: `key:${k}` };
      }
      const hit = inspectValueForWaf(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// Express middleware: IP Blocklist + WAF Inspection on /api/*
export const socProtectionMiddleware: express.RequestHandler = (req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const ip = getClientIp(req);
  const store = loadSocStore();

  // 1. Strict API Security Headers
  if (store.policy.strictApiHeaders) {
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-XSS-Protection', '0');
  }

  // 2. Active IP Blocklist Check (allow Super Admin SOC routes from loopback to prevent self-lockout)
  const blockedIdx = store.blockedIps.findIndex((b) => b.ip === ip);
  if (blockedIdx !== -1) {
    const blocked = store.blockedIps[blockedIdx];
    const isExpired = blocked.expiresAt && new Date(blocked.expiresAt).getTime() <= Date.now();
    if (isExpired) {
      store.blockedIps.splice(blockedIdx, 1);
      saveSocStore(store);
    } else if (!isLoopbackIp(ip)) {
      store.blockedIps[blockedIdx].hits += 1;
      saveSocStore(store);
      return res.status(403).json({
        error: 'Akses ditolak oleh sistem keamanan SOC (IP Anda sedang diblokir).',
      });
    }
  }

  // 3. WAF Payload & Query Inspection
  if (store.policy.wafEnabled) {
    const rawUrl = decodeURIComponentSafe(req.originalUrl || req.url || '');
    const urlHit = inspectValueForWaf(rawUrl);
    const bodyHit = !urlHit && req.body ? inspectValueForWaf(req.body) : null;
    const hit = urlHit || bodyHit;

    if (hit) {
      const now = Date.now();
      const recentStrikes = (wafStrikeBuckets.get(ip) || []).filter(
        (ts) => now - ts < 15 * 60 * 1000
      );
      recentStrikes.push(now);
      wafStrikeBuckets.set(ip, recentStrikes);

      const shouldAutoBlock =
        store.policy.autoBlockEnabled && !isLoopbackIp(ip) && recentStrikes.length >= 3;

      recordSocEvent({
        severity: hit.rule.severity,
        category: 'WAF_BLOCK',
        ip,
        method: req.method,
        path: req.path,
        userAgent: String(req.headers['user-agent'] || ''),
        summary: `WAF memblokir indikasi ${hit.rule.name} pada ${req.method} ${req.path}.`,
        details: `Sample: ${hit.sample}${shouldAutoBlock ? ' · IP otomatis diblokir.' : ''}`,
      });

      if (shouldAutoBlock) {
        blockIpAddress({
          ip,
          reason: `Auto-Ban WAF: ${hit.rule.name} (${recentStrikes.length}x percobaan)`,
          blockedBy: 'SOC WAF Engine',
          durationMinutes: store.policy.autoBlockDurationMinutes,
          autoBlocked: true,
        });
      }

      return res.status(403).json({
        error: `Permintaan diblokir oleh SOC Web Application Firewall (${hit.rule.name}).`,
      });
    }
  }

  next();
};

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildSocOverview(
  activeSessions: SocActiveSession[],
  extra?: {
    productionChecklist?: ProductionSecurityCheck[];
    auditIntegrity?: AuditIntegrityReport;
  }
): SocOverviewResponse {
  const store = loadSocStore();
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const openEvents = store.events.filter((e) => e.status === 'OPEN');
  const criticalOpenCount = openEvents.filter((e) => e.severity === 'CRITICAL').length;
  const highOpenCount = openEvents.filter((e) => e.severity === 'HIGH').length;
  const eventsLast24h = store.events.filter(
    (e) => new Date(e.timestamp).getTime() >= dayAgo
  ).length;
  const wafBlocksTotal = store.events.filter((e) => e.category === 'WAF_BLOCK').length;

  let threatLevel: 'NORMAL' | 'ELEVATED' | 'CRITICAL' = 'NORMAL';
  if (criticalOpenCount > 0 || highOpenCount >= 3) {
    threatLevel = 'CRITICAL';
  } else if (highOpenCount > 0 || openEvents.length >= 4) {
    threatLevel = 'ELEVATED';
  }

  // Compute Security Posture Score (0-100)
  let score = 100;
  if (!store.policy.wafEnabled) score -= 25;
  if (!store.policy.autoBlockEnabled) score -= 15;
  if (!store.policy.strictApiHeaders) score -= 10;
  if (!store.policy.alertOnRbacViolation) score -= 5;
  score -= Math.min(25, criticalOpenCount * 10 + highOpenCount * 4);
  score = Math.max(20, Math.min(100, score));

  const categoryCounts: Record<string, number> = {};
  for (const ev of store.events) {
    categoryCounts[ev.category] = (categoryCounts[ev.category] || 0) + 1;
  }

  return {
    threatLevel,
    securityScore: score,
    summary: {
      totalEvents: store.events.length,
      openAlerts: openEvents.length,
      criticalOpen: criticalOpenCount,
      highOpen: highOpenCount,
      eventsLast24h,
      blockedIpsCount: store.blockedIps.length,
      activeSessionsCount: activeSessions.length,
      wafBlocksTotal,
    },
    categoryBreakdown: Object.entries(categoryCounts).map(([category, count]) => ({
      category: category as SocCategory,
      count,
    })),
    policy: store.policy,
    blockedIps: store.blockedIps,
    events: store.events.slice(0, 150),
    activeSessions,
    ...(extra || {}),
  };
}
