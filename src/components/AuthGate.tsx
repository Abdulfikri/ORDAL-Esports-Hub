import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { api } from '../api';
import type { AuthUser, ScrimGame, UserRole } from '../types';
import { OrdalWordmark } from './BrandAssets';
import { SCRIM_GAMES } from './ScrimArena';

export interface TeamAuthPrefill {
  teamName?: string;
  teamTag?: string;
  captainIgn?: string;
  captainContact?: string;
}

interface AuthGateProps {
  requestedRole?: UserRole;
  initialMode?: 'login' | 'register';
  prefillTeam?: TeamAuthPrefill;
  onSuccess: (user: AuthUser, idleTimeoutMs?: number) => void;
  onBackToSite: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  requestedRole,
  initialMode = 'login',
  prefillTeam,
  onSuccess,
  onBackToSite,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Team Registration onboarding fields (completed via Google Sign-In)
  const [teamName, setTeamName] = useState(prefillTeam?.teamName || '');
  const [teamTag, setTeamTag] = useState(prefillTeam?.teamTag || '');
  const [captainIgn, setCaptainIgn] = useState(prefillTeam?.captainIgn || '');
  const [captainContact, setCaptainContact] = useState(prefillTeam?.captainContact || '');
  const [primaryGame, setPrimaryGame] = useState<ScrimGame>('POINT BLANK');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!prefillTeam) return;
    if (prefillTeam.teamName) setTeamName(prefillTeam.teamName);
    if (prefillTeam.teamTag) setTeamTag(prefillTeam.teamTag);
    if (prefillTeam.captainIgn) setCaptainIgn(prefillTeam.captainIgn);
    if (prefillTeam.captainContact) setCaptainContact(prefillTeam.captainContact);
  }, [prefillTeam]);

  const handleGoogleLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await api.authGoogleLogin();
      onSuccess(res.user, res.idleTimeoutMs);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login dengan Google dibatalkan atau gagal. Silakan coba kembali.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterWithGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!teamName.trim() || !teamTag.trim() || !captainIgn.trim()) {
      setError('Lengkapi Nama Tim, Tag Tim, dan IGN Kapten sebelum melanjutkan.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.authRegisterTeam({
        teamName: teamName.trim(),
        teamTag: teamTag.trim(),
        captainIgn: captainIgn.trim(),
        captainContact: captainContact.trim(),
        primaryGame,
      });
      onSuccess(res.user, res.idleTimeoutMs);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Registrasi tim dengan Google gagal.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#F8FAFC] ordal-tactical-grid flex flex-col justify-center py-10 px-4">
      <div className="max-w-lg w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToSite}
            className="inline-flex items-center gap-2 font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Website
          </button>
          <OrdalWordmark height={32} />
        </div>

        <div className="bg-[#12161F] border border-white/[0.08] rounded-[8px] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.08] bg-[#0A0C10]/60">
            <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
              PORTAL AKUN ORDAL
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold uppercase text-[#F8FAFC]">
              {mode === 'login' ? 'Masuk ke Akun Anda' : 'Buat Akun Tim Baru'}
            </h1>
            {mode === 'login' && !requestedRole && (
              <p className="mt-1 text-xs text-[#94A3B8]">
                Masuk dengan akun Google terverifikasi. Anda akan diarahkan otomatis ke portal sesuai peran Anda.
              </p>
            )}
            {requestedRole && (
              <p className="mt-1 text-xs text-[#94A3B8]">
                Silakan masuk dengan Google untuk membuka dashboard{' '}
                <span className="text-[#CCFF00] font-semibold">
                  {requestedRole === 'TEAM'
                    ? 'Tim'
                    : requestedRole === 'CASTER'
                      ? 'Shoutcaster'
                      : requestedRole === 'LEAGUE_OPS'
                        ? 'League Ops (Turnamen)'
                        : 'Super Admin'}
                </span>
                .
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 border-b border-white/[0.08] font-telemetry text-xs font-bold uppercase tracking-[0.08em]">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`py-3.5 inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                mode === 'login'
                  ? 'bg-[#00F0FF]/12 text-[#00F0FF] border-b-2 border-[#00F0FF]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Masuk Akun
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`py-3.5 inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                mode === 'register'
                  ? 'bg-[#CCFF00]/12 text-[#CCFF00] border-b-2 border-[#CCFF00]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Daftar Tim Baru
            </button>
          </div>

          <div className="p-6 space-y-5">
            {error && (
              <div className="p-3 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                {error}
              </div>
            )}

            {mode === 'login' && (
              <div className="space-y-4">
                <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-2">
                  <div className="flex items-center gap-2 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                    <ShieldCheck className="w-4 h-4" />
                    Autentikasi Google Terverifikasi
                  </div>
                  <p className="text-xs text-[#CBD5E1] leading-relaxed">
                    Gunakan akun Google Anda untuk mengakses Portal Tim, Shoutcaster, League Ops, atau Super Admin secara aman tanpa password terpisah.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogleLogin}
                  className="w-full min-h-[48px] px-4 bg-[#00F0FF] text-[#0A0C10] font-display text-base font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {submitting ? 'Menghubungkan ke Google...' : 'Masuk dengan Google'}
                </button>
              </div>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegisterWithGoogle} className="space-y-3.5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                      Nama Tim
                    </label>
                    <input
                      type="text"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="FALCON STRIKE"
                      className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                      Tag
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      value={teamTag}
                      onChange={(e) => setTeamTag(e.target.value.toUpperCase())}
                      placeholder="FLCN"
                      className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                      IGN Kapten
                    </label>
                    <input
                      type="text"
                      required
                      value={captainIgn}
                      onChange={(e) => setCaptainIgn(e.target.value)}
                      placeholder="FLCN_Ardi#01"
                      className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                      Game Utama
                    </label>
                    <select
                      value={primaryGame}
                      onChange={(e) => setPrimaryGame(e.target.value as ScrimGame)}
                      className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    >
                      {SCRIM_GAMES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                    Kontak Kapten (WhatsApp / Discord)
                  </label>
                  <input
                    type="text"
                    value={captainContact}
                    onChange={(e) => setCaptainContact(e.target.value)}
                    placeholder="WA: 0812-xxxx / Discord: ardi#99"
                    className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[46px] bg-[#CCFF00] text-[#0A0C10] font-display text-base font-bold uppercase tracking-[0.05em] rounded-[4px] disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Menghubungkan Akun Google...'
                    : 'Lanjutkan dengan Google & Aktifkan Tim'}
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A3B8]">
              <span>
                {mode === 'login' ? 'Belum punya akun tim?' : 'Sudah punya akun Google terdaftar?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError('');
                }}
                className="font-semibold text-[#00F0FF] hover:underline cursor-pointer"
              >
                {mode === 'login' ? 'Daftar Tim Baru →' : 'Masuk dengan Google →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
