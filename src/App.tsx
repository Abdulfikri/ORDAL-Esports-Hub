/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert, X } from 'lucide-react';
import {
  api,
  broadcastSessionSync,
  getClientCsrfToken,
  markSessionActive,
  recordLastActivityAt,
  SESSION_EXPIRED_EVENT,
} from './api';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthGate, type TeamAuthPrefill } from './components/AuthGate';
import {
  BrandSettingsProvider,
  isSafeLogoSrc,
  ORDAL_LOGOS,
  OrdalMonogram,
} from './components/BrandAssets';
import { CasterDashboard } from './components/CasterDashboard';
import { IdleSessionMonitor, DEFAULT_INACTIVITY_TIMEOUT_MS } from './components/IdleSessionMonitor';
import { LeagueOpsDashboard } from './components/LeagueOpsDashboard';
import { PublicHubSkeleton } from './components/LoadingSkeletons';
import { PublicWebsite } from './components/PublicWebsite';
import { TeamDashboard } from './components/TeamDashboard';
import type { AuthUser, OrdalDatabase, UserRole } from './types';

type AppView = 'website' | 'auth' | 'team' | 'caster' | 'league_ops' | 'admin';

function roleToView(role: UserRole): AppView {
  if (role === 'TEAM') return 'team';
  if (role === 'CASTER') return 'caster';
  if (role === 'LEAGUE_OPS') return 'league_ops';
  return 'admin';
}

function viewToHash(view: AppView): string {
  if (view === 'team') return '#team';
  if (view === 'caster') return '#caster';
  if (view === 'league_ops') return '#league-ops';
  if (view === 'admin') return '#admin';
  if (view === 'auth') return '#login';
  return '';
}

export default function App() {
  const [view, setView] = useState<AppView>(() => {
    const h = window.location.hash;
    if (h === '#admin') return 'admin';
    if (h === '#league-ops') return 'league_ops';
    if (h === '#caster') return 'caster';
    if (h === '#team') return 'team';
    if (h === '#login') return 'auth';
    return 'website';
  });
  const [requestedRole, setRequestedRole] = useState<UserRole | undefined>(undefined);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [authPrefillTeam, setAuthPrefillTeam] = useState<TeamAuthPrefill | undefined>(undefined);
  const [monitoredCasterId, setMonitoredCasterId] = useState<string | undefined>(undefined);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [idleTimeoutMs, setIdleTimeoutMs] = useState<number>(DEFAULT_INACTIVITY_TIMEOUT_MS);
  const [authChecked, setAuthChecked] = useState(false);

  const [db, setDb] = useState<OrdalDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const logoutInFlightRef = useRef(false);
  const currentUserRef = useRef<AuthUser | null>(null);
  const nextToastIdRef = useRef(1);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((message: string) => {
    const id = nextToastIdRef.current++;
    setToasts((prev) => [...prev.filter((item) => item.message !== message).slice(-2), { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  }, []);

  const loadState = useCallback(async () => {
    try {
      setError('');
      const data = await api.getState();
      setDb(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data ORDAL Esports Hub.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    const customFavicon =
      isSafeLogoSrc(db?.brandSettings?.faviconUrl) ||
      isSafeLogoSrc(db?.brandSettings?.monogramUrl);
    const nextHref = customFavicon || ORDAL_LOGOS.monogramDark;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== nextHref) {
      link.setAttribute('href', nextHref);
    }
  }, [db?.brandSettings?.faviconUrl, db?.brandSettings?.monogramUrl]);

  useEffect(() => {
    api
      .authMe()
      .then((res) => {
        if (typeof res.idleTimeoutMs === 'number' && res.idleTimeoutMs > 0) {
          setIdleTimeoutMs(res.idleTimeoutMs);
        }
        if (res.authenticated && res.user) {
          setCurrentUser(res.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {
        markSessionActive(false);
        setCurrentUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const navigateView = useCallback((next: AppView, sectionId?: string) => {
    setView(next);
    const nextHash = viewToHash(next);
    if (next !== 'website' && window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${nextHash}`);
    } else {
      window.location.hash = nextHash;
    }
    if (next === 'website' && sectionId) {
      window.setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleOpenAuth = useCallback(
    (
      role?: UserRole,
      options?: { mode?: 'login' | 'register'; prefillTeam?: TeamAuthPrefill }
    ) => {
      setRequestedRole(role);
      setAuthInitialMode(options?.mode || 'login');
      setAuthPrefillTeam(options?.prefillTeam);
      navigateView('auth');
    },
    [navigateView]
  );

  const handleOpenRolePortal = useCallback(
    (role: UserRole) => {
      if (currentUser && (currentUser.role === role || (role === 'CASTER' && currentUser.role === 'SUPER_ADMIN'))) {
        navigateView(roleToView(role));
        return;
      }
      if (currentUser && currentUser.role !== role) {
        showToast(
          `Akun aktif (${currentUser.role}) berbeda. Silakan login menggunakan akun ${role}.`
        );
      }
      setRequestedRole(role);
      setAuthInitialMode('login');
      setAuthPrefillTeam(undefined);
      navigateView('auth');
    },
    [currentUser, navigateView, showToast]
  );

  const handleMonitorCaster = useCallback(
    (casterId?: string) => {
      setMonitoredCasterId(casterId);
      navigateView('caster');
    },
    [navigateView]
  );

  const handleAuthSuccess = useCallback(
    (user: AuthUser, serverIdleTimeoutMs?: number) => {
      if (typeof serverIdleTimeoutMs === 'number' && serverIdleTimeoutMs > 0) {
        setIdleTimeoutMs(serverIdleTimeoutMs);
      }
      recordLastActivityAt(Date.now());
      setSessionNotice(null);
      setCurrentUser(user);
      setRequestedRole(undefined);
      setAuthInitialMode('login');
      setAuthPrefillTeam(undefined);
      void loadState();
      const targetView = roleToView(user.role);
      navigateView(targetView);
      showToast(`Selamat datang, ${user.displayName} (${user.role}).`);
    },
    [loadState, navigateView, showToast]
  );

  const performLogout = useCallback(
    async (
      reason: 'manual' | 'inactivity' | 'expired' = 'manual',
      customMessage?: string
    ) => {
      if (logoutInFlightRef.current) return;
      logoutInFlightRef.current = true;
      try {
        // 1. Capture CSRF token for server revocation, then synchronously purge client session & sensitive memory
        const csrfForLogout = getClientCsrfToken();
        const hadUser = Boolean(currentUserRef.current);
        markSessionActive(false);
        currentUserRef.current = null;
        setCurrentUser(null);
        setMonitoredCasterId(undefined);
        setRequestedRole(undefined);
        setAuthInitialMode('login');
        setAuthPrefillTeam(undefined);
        setDb((prev) =>
          prev
            ? {
                ...prev,
                payments: [],
                ledger: [],
                auditLogs: [],
              }
            : prev
        );
        navigateView('website');
        if (hadUser) {
          broadcastSessionSync({ type: 'LOGOUT' });
        }

        // 2. Notify server to revoke hashed session & clear HttpOnly cookie (keepalive survives tab close)
        if (reason !== 'expired') {
          try {
            await api.authLogout(csrfForLogout);
          } catch {
            // ignore logout network errors
          }
        }

        // 3. Reload unauthenticated public state
        void loadState();

        if (reason === 'inactivity') {
          const mins = Math.round(idleTimeoutMs / 60000);
          const msg = `Sesi Anda diakhiri otomatis karena tidak ada aktivitas selama ${mins} menit demi keamanan pada komputer bersama.`;
          setSessionNotice(msg);
          showToast(`Auto-logout aktif: sesi berakhir setelah ${mins} menit tidak aktif.`);
        } else if (reason === 'expired') {
          const msg =
            customMessage ||
            'Sesi Anda telah berakhir atau dicabut oleh sistem keamanan. Silakan login kembali.';
          setSessionNotice(msg);
          showToast('Sesi berakhir. Silakan login kembali.');
        } else {
          setSessionNotice(null);
          showToast('Anda telah keluar dari akun.');
        }
      } finally {
        logoutInFlightRef.current = false;
      }
    },
    [idleTimeoutMs, loadState, navigateView, showToast]
  );

  const handleLogout = useCallback(() => performLogout('manual'), [performLogout]);

  useEffect(() => {
    const handleSessionExpired = (e: Event) => {
      const detailMsg = (e as CustomEvent<{ message?: string }>)?.detail?.message;
      if (currentUserRef.current) {
        void performLogout('expired', detailMsg);
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [performLogout]);

  const handlePublicCreateSquad = async (payload: {
    name: string;
    tag: string;
    tournamentId: string;
    captainIgn: string;
    captainContact: string;
    roster: string[];
    captchaToken?: string;
  }) => {
    await api.createSquad(payload);
    await loadState();
    showToast(`Squad [${payload.tag}] berhasil didaftarkan ke turnamen.`);
  };

  if (loading || !authChecked) {
    return <PublicHubSkeleton />;
  }

  if (error || !db) {
    return (
      <div className="min-h-screen bg-[#0A0C10] flex flex-col items-center justify-center p-6 text-center">
        <OrdalMonogram size={52} />
        <h1 className="mt-4 font-display text-2xl font-bold uppercase text-[#F8FAFC]">
          Koneksi Server Terputus
        </h1>
        <p className="mt-2 text-sm text-[#94A3B8] max-w-md">{error}</p>
        <button
          type="button"
          onClick={loadState}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Muat Ulang
        </button>
      </div>
    );
  }

  // Strictly gate each separate dashboard by its authenticated role
  const renderView = () => {
    if (view === 'auth') {
      return (
        <AuthGate
          requestedRole={requestedRole}
          initialMode={authInitialMode}
          prefillTeam={authPrefillTeam}
          onSuccess={handleAuthSuccess}
          onBackToSite={() => {
            setAuthInitialMode('login');
            setAuthPrefillTeam(undefined);
            navigateView('website');
          }}
        />
      );
    }

    if (view === 'team') {
      if (!currentUser || currentUser.role !== 'TEAM') {
        return (
          <AuthGate
            requestedRole="TEAM"
            onSuccess={handleAuthSuccess}
            onBackToSite={() => navigateView('website')}
          />
        );
      }
      return (
        <TeamDashboard
          user={currentUser}
          db={db}
          onUserUpdated={setCurrentUser}
          onRefresh={loadState}
          onCreateSquad={handlePublicCreateSquad}
          onBackToSite={(sectionId) => navigateView('website', sectionId)}
          onLogout={handleLogout}
          onNotify={showToast}
        />
      );
    }

    if (view === 'caster') {
      if (!currentUser || (currentUser.role !== 'CASTER' && currentUser.role !== 'SUPER_ADMIN')) {
        return (
          <AuthGate
            requestedRole="CASTER"
            onSuccess={handleAuthSuccess}
            onBackToSite={() => navigateView('website')}
          />
        );
      }
      return (
        <CasterDashboard
          user={currentUser}
          db={db}
          initialCasterId={monitoredCasterId}
          onRefresh={loadState}
          onBackToSite={() => navigateView('website')}
          onBackToAdmin={
            currentUser.role === 'SUPER_ADMIN' ? () => navigateView('admin') : undefined
          }
          onLogout={handleLogout}
          onNotify={showToast}
        />
      );
    }

    if (view === 'league_ops') {
      if (!currentUser || currentUser.role !== 'LEAGUE_OPS') {
        return (
          <AuthGate
            requestedRole="LEAGUE_OPS"
            onSuccess={handleAuthSuccess}
            onBackToSite={() => navigateView('website')}
          />
        );
      }
      return (
        <LeagueOpsDashboard
          user={currentUser}
          db={db}
          onUserUpdated={setCurrentUser}
          onRefresh={loadState}
          onBackToSite={() => navigateView('website')}
          onLogout={handleLogout}
          onNotify={showToast}
        />
      );
    }

    if (view === 'admin') {
      if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
        return (
          <AuthGate
            requestedRole="SUPER_ADMIN"
            onSuccess={handleAuthSuccess}
            onBackToSite={() => navigateView('website')}
          />
        );
      }
      return (
        <AdminDashboard
          user={currentUser}
          db={db}
          onUserUpdated={setCurrentUser}
          onRefresh={loadState}
          onBackToSite={() => navigateView('website')}
          onMonitorCaster={handleMonitorCaster}
          onLogout={handleLogout}
          onNotify={showToast}
        />
      );
    }

    return (
      <PublicWebsite
        db={db}
        currentUser={currentUser}
        onOpenAuth={handleOpenAuth}
        onOpenRolePortal={handleOpenRolePortal}
        onLogout={handleLogout}
        onCreateSquad={handlePublicCreateSquad}
        onRefresh={loadState}
        onNotify={showToast}
      />
    );
  };

  return (
    <BrandSettingsProvider settings={db?.brandSettings}>
      {renderView()}

      <IdleSessionMonitor
        user={currentUser}
        idleTimeoutMs={idleTimeoutMs}
        onAutoLogout={(reason) => {
          void performLogout(reason);
        }}
        onNotify={showToast}
      />

      {sessionNotice && !currentUser && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-[70] max-w-md bg-[#12161F] border border-[#FACC15]/50 rounded-[6px] p-4 shadow-2xl flex items-start gap-3"
        >
          <ShieldAlert className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-xs font-semibold text-[#F8FAFC]">Sesi Diakhiri Secara Otomatis</p>
            <p className="text-xs leading-relaxed text-[#CBD5E1]">{sessionNotice}</p>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setSessionNotice(null);
                  handleOpenAuth();
                }}
                className="px-3 py-1.5 bg-[#00F0FF] text-[#0A0C10] rounded-[4px] font-display text-[11px] font-bold uppercase tracking-[0.06em] cursor-pointer"
              >
                Login Ulang
              </button>
              <button
                type="button"
                onClick={() => setSessionNotice(null)}
                className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-[#CBD5E1] rounded-[4px] text-[11px] font-medium cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup pemberitahuan sesi"
            onClick={() => setSessionNotice(null)}
            className="text-[#94A3B8] hover:text-[#F8FAFC] p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toast Notification Queue */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 max-w-[calc(100vw-2.5rem)] sm:max-w-md"
        >
          {toasts.map((item) => (
            <div
              key={item.id}
              role="status"
              className="flex items-center gap-2.5 px-4 py-3 bg-[#1A202C] border border-[#00F0FF]/50 rounded-[4px] glow-cyan text-xs font-telemetry uppercase tracking-[0.06em] text-[#F8FAFC]"
            >
              <CheckCircle2 className="w-4 h-4 text-[#00F0FF] shrink-0" />
              <span className="flex-1">{item.message}</span>
              <button
                type="button"
                aria-label="Tutup notifikasi"
                onClick={() => dismissToast(item.id)}
                className="p-0.5 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </BrandSettingsProvider>
  );
}
