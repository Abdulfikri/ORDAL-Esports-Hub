import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import {
  api,
  broadcastSessionSync,
  getLastActivityAt,
  LAST_ACTIVITY_KEY,
  recordLastActivityAt,
  SESSION_CHANNEL_NAME,
} from '../api';
import type { AuthUser } from '../types';

export const DEFAULT_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const KEEP_ALIVE_SYNC_MS = 4 * 60 * 1000; // rotate session token & sync activity every 4 minutes
const ACTIVITY_THROTTLE_MS = 2000;

interface IdleSessionMonitorProps {
  user: AuthUser | null;
  idleTimeoutMs?: number;
  onAutoLogout: (reason: 'inactivity' | 'manual' | 'expired') => void;
  onNotify: (msg: string) => void;
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const IdleSessionMonitor: React.FC<IdleSessionMonitorProps> = ({
  user,
  idleTimeoutMs,
  onAutoLogout,
  onNotify,
}) => {
  const effectiveTimeoutMs = Math.max(60_000, idleTimeoutMs || DEFAULT_INACTIVITY_TIMEOUT_MS);
  const warningThresholdMs = Math.max(
    0,
    effectiveTimeoutMs - Math.min(2 * 60 * 1000, Math.floor(effectiveTimeoutMs * 0.2))
  );

  const [remainingMs, setRemainingMs] = useState<number>(effectiveTimeoutMs);
  const [showWarning, setShowWarning] = useState(false);
  const [keepingAlive, setKeepingAlive] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const lastServerSyncRef = useRef<number>(Date.now());
  const lastWriteThrottleRef = useRef<number>(0);
  const warningVisibleRef = useRef<boolean>(false);
  const logoutTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    warningVisibleRef.current = showWarning;
  }, [showWarning]);

  const syncNow = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastWriteThrottleRef.current = now;
    recordLastActivityAt(now);
    broadcastSessionSync({ type: 'ACTIVITY', ts: now });
  }, []);

  // Initialize / reset monitor whenever authenticated user or server timeout changes
  useEffect(() => {
    if (!user) {
      setShowWarning(false);
      warningVisibleRef.current = false;
      logoutTriggeredRef.current = false;
      return;
    }

    logoutTriggeredRef.current = false;
    const stored = getLastActivityAt();
    const now = Date.now();
    if (stored && now - stored >= effectiveTimeoutMs) {
      logoutTriggeredRef.current = true;
      onAutoLogout('inactivity');
      return;
    }

    const initialTs = stored && stored <= now ? stored : now;
    lastActivityRef.current = initialTs;
    lastServerSyncRef.current = now;
    if (!stored) {
      recordLastActivityAt(now);
    }
    setRemainingMs(Math.max(0, effectiveTimeoutMs - (now - initialTs)));
    setShowWarning(now - initialTs >= warningThresholdMs);
  }, [user, effectiveTimeoutMs, warningThresholdMs, onAutoLogout]);

  // Listen strictly to genuine browser-trusted DOM user interactions & cross-tab sync
  useEffect(() => {
    if (!user) return;

    const handleUserActivity = (e: Event) => {
      // Ignore synthetic script-dispatched events to prevent automated idle bypass
      if (!e.isTrusted) return;
      // Once the 2-minute security warning is shown, require explicit confirmation via "Tetap Masuk"
      if (warningVisibleRef.current || logoutTriggeredRef.current) return;

      const now = Date.now();
      if (now - lastWriteThrottleRef.current < ACTIVITY_THROTTLE_MS) return;

      lastActivityRef.current = now;
      lastWriteThrottleRef.current = now;
      recordLastActivityAt(now);
      broadcastSessionSync({ type: 'ACTIVITY', ts: now });

      if (now - lastServerSyncRef.current >= KEEP_ALIVE_SYNC_MS) {
        lastServerSyncRef.current = now;
        api.authKeepAlive().catch(() => {
          // 401 is handled globally via SESSION_EXPIRED_EVENT
        });
      }
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'pointerdown',
    ];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
        channel.onmessage = (msg: MessageEvent<{ type?: string; ts?: number }>) => {
          const data = msg.data;
          if (!data) return;
          if (data.type === 'LOGOUT' && !logoutTriggeredRef.current) {
            logoutTriggeredRef.current = true;
            setShowWarning(false);
            onAutoLogout('expired');
            return;
          }
          if (data.type === 'ACTIVITY' && typeof data.ts === 'number') {
            const safeTs = Math.min(data.ts, Date.now());
            if (safeTs > lastActivityRef.current && !warningVisibleRef.current) {
              lastActivityRef.current = safeTs;
            }
          }
        };
      }
    } catch {
      channel = null;
    }

    // Secondary cross-tab synchronization via localStorage events (clamped to current clock)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY && e.newValue === null && !logoutTriggeredRef.current) {
        logoutTriggeredRef.current = true;
        setShowWarning(false);
        onAutoLogout('expired');
        return;
      }
      if (e.key === LAST_ACTIVITY_KEY && e.newValue) {
        const parsed = Number(e.newValue);
        const now = Date.now();
        if (Number.isFinite(parsed) && parsed > 0) {
          const clamped = Math.min(parsed, now);
          if (clamped > lastActivityRef.current) {
            lastActivityRef.current = clamped;
            if (now - clamped < warningThresholdMs) {
              setShowWarning(false);
            }
          }
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        try {
          channel.close();
        } catch {
          // ignore
        }
      }
    };
  }, [user, warningThresholdMs, onAutoLogout]);

  // Periodic evaluation + immediate wake-up evaluation on tab visibility / window focus
  useEffect(() => {
    if (!user) return;

    const evaluateIdleState = () => {
      if (logoutTriggeredRef.current) return;
      const now = Date.now();
      const storedTs = getLastActivityAt();
      const effectiveLast = Math.max(
        lastActivityRef.current,
        storedTs !== null ? Math.min(storedTs, now) : 0
      );
      lastActivityRef.current = effectiveLast;

      const idleMs = now - effectiveLast;
      const leftMs = Math.max(0, effectiveTimeoutMs - idleMs);
      setRemainingMs(leftMs);

      if (idleMs >= effectiveTimeoutMs) {
        logoutTriggeredRef.current = true;
        setShowWarning(false);
        onAutoLogout('inactivity');
        return;
      }

      if (idleMs >= warningThresholdMs) {
        if (!warningVisibleRef.current) {
          setShowWarning(true);
        }
      } else if (warningVisibleRef.current) {
        setShowWarning(false);
      }
    };

    const intervalId = window.setInterval(evaluateIdleState, 1000);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        evaluateIdleState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [user, effectiveTimeoutMs, warningThresholdMs, onAutoLogout]);

  const handleStaySignedIn = async () => {
    setKeepingAlive(true);
    try {
      await api.authKeepAlive();
      syncNow();
      lastServerSyncRef.current = Date.now();
      setRemainingMs(effectiveTimeoutMs);
      setShowWarning(false);
      onNotify('Sesi Anda diperpanjang dan token sesi diperbarui.');
    } catch {
      logoutTriggeredRef.current = true;
      setShowWarning(false);
      onAutoLogout('expired');
    } finally {
      setKeepingAlive(false);
    }
  };

  if (!user || !showWarning) return null;

  const warningWindowTotal = Math.max(1000, effectiveTimeoutMs - warningThresholdMs);
  const progressPct = Math.min(100, Math.max(0, (remainingMs / warningWindowTotal) * 100));

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-session-title"
      aria-describedby="idle-session-desc"
      className="fixed inset-0 z-[80] bg-[#0A0C10]/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-[#12161F] border border-[#FACC15]/45 rounded-[6px] p-6 space-y-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[4px] bg-[#FACC15]/15 border border-[#FACC15]/35 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-[#FACC15]" />
          </div>
          <div className="space-y-1">
            <p className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#FACC15]">
              Keamanan Sesi Aktif · {user.role}
            </p>
            <h2
              id="idle-session-title"
              className="font-display text-xl font-bold uppercase text-[#F8FAFC]"
            >
              Sesi Akan Berakhir Otomatis
            </h2>
          </div>
        </div>

        <p id="idle-session-desc" className="text-sm leading-relaxed text-[#CBD5E1]">
          Tidak ada aktivitas terdeteksi selama hampir {Math.round(effectiveTimeoutMs / 60000)} menit.
          Demi mencegah penyalahgunaan akun pada komputer bersama atau publik, sesi{' '}
          <span className="font-semibold text-[#F8FAFC]">{user.displayName}</span> akan otomatis
          keluar dalam:
        </p>

        <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8]">
              <Clock className="w-3.5 h-3.5 text-[#FACC15]" />
              Sisa waktu sebelum auto-logout
            </span>
            <span className="font-mono tabular-nums text-2xl font-bold text-[#FACC15]">
              {formatCountdown(remainingMs)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/[0.08] rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-[#FACC15] transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              logoutTriggeredRef.current = true;
              setShowWarning(false);
              onAutoLogout('manual');
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 rounded-[4px] font-display text-xs font-bold uppercase tracking-[0.06em] text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar Sekarang
          </button>
          <button
            type="button"
            disabled={keepingAlive}
            onClick={handleStaySignedIn}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00F0FF] hover:bg-[#33F3FF] disabled:opacity-60 rounded-[4px] font-display text-xs font-bold uppercase tracking-[0.06em] text-[#0A0C10] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {keepingAlive ? 'Memperpanjang...' : 'Tetap Masuk'}
          </button>
        </div>
      </div>
    </div>
  );
};
