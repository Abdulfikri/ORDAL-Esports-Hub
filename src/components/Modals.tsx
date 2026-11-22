import React, { useState } from 'react';
import { Award, ShieldCheck, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useMatchNotifications } from '../hooks/useMatchNotifications';
import type { Match, TeamProfile, Tournament } from '../types';
import { MatchNotificationButton } from './MatchNotificationButton';
import { TURNSTILE_SITE_KEY, TurnstileWidget } from './TurnstileWidget';

interface MatchDetailModalProps {
  match: Match | null;
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  onClose,
  onNotify,
}) => {
  const { isNotified, toggleMatchNotification } = useMatchNotifications(onNotify);
  useEscapeKey(Boolean(match), onClose);

  if (!match) return null;

  const isLive = match.status === 'LIVE';
  const isFinished = match.status === 'FINISHED';
  const isUpcoming = match.status === 'UPCOMING';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-[#1A202C] border border-white/15 rounded-[6px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#12161F] border-b border-white/[0.08]">
          <div className="flex items-center gap-3 font-telemetry text-xs uppercase tracking-[0.08em]">
            <span className="text-[#00F0FF] font-bold">{match.game}</span>
            <span className="text-white/25">/</span>
            <span className="text-[#94A3B8]">{match.round}</span>
            <span className="text-white/25">/</span>
            <span className="text-[#F8FAFC]">{match.mapName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scoreboard */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            {isLive ? (
              <span className="inline-flex items-center gap-2 font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-[#FF2E5B]">
                <span className="w-2 h-2 rounded-full bg-[#FF2E5B] live-dot-pulse" />
                PERTANDINGAN LIVE
              </span>
            ) : (
              <span className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#94A3B8]">
                STATUS: {match.status}
              </span>
            )}
            <span className="font-telemetry text-xs text-[#94A3B8]">ID: {match.id.toUpperCase()}</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-6 px-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
            <div>
              <div className="font-telemetry text-xs text-[#94A3B8] uppercase tracking-[0.08em]">
                {match.teamATag}
              </div>
              <div className="font-display text-2xl font-bold uppercase text-[#F8FAFC] mt-0.5">
                {match.teamA}
              </div>
            </div>

            <div className="flex items-center gap-3 font-display text-4xl font-bold tabular-nums">
              <span className={match.winnerTag === match.teamATag ? 'text-[#00F0FF]' : 'text-[#F8FAFC]'}>
                {match.scoreA}
              </span>
              <span className="text-[#94A3B8] text-2xl">:</span>
              <span className={match.winnerTag === match.teamBTag ? 'text-[#00F0FF]' : 'text-[#F8FAFC]'}>
                {match.scoreB}
              </span>
            </div>

            <div className="text-right">
              <div className="font-telemetry text-xs text-[#94A3B8] uppercase tracking-[0.08em]">
                {match.teamBTag}
              </div>
              <div className="font-display text-2xl font-bold uppercase text-[#F8FAFC] mt-0.5">
                {match.teamB}
              </div>
            </div>
          </div>

          {/* Match Telemetry Metadata */}
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[4px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                MVP TELEMETRY
              </div>
              <div className="mt-1.5 flex items-center gap-2 font-telemetry text-sm font-bold text-[#CCFF00]">
                <Award className="w-4 h-4 shrink-0" />
                <span>{match.mvpIgn || 'Menunggu Hasil Akhir'}</span>
              </div>
            </div>
            <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[4px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                PEMENANG BRACKET
              </div>
              <div className="mt-1.5 flex items-center gap-2 font-telemetry text-sm font-bold text-[#00F0FF]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {isFinished && match.winnerTag
                    ? `${match.winnerTag} (LOLOS)`
                    : 'Masih Berlangsung'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-white/[0.08]">
            <div>
              {isUpcoming && (
                <MatchNotificationButton
                  showLabel
                  active={isNotified(match.id)}
                  matchLabel={`${match.teamATag} vs ${match.teamBTag}`}
                  onToggle={() => toggleMatchNotification(match)}
                />
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface RegisterSquadModalProps {
  isOpen: boolean;
  tournaments: Tournament[];
  defaultTournamentId?: string;
  teamProfile?: TeamProfile;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    tag: string;
    tournamentId: string;
    captainIgn: string;
    captainContact: string;
    roster: string[];
    captchaToken?: string;
  }) => Promise<void>;
}

export const RegisterSquadModal: React.FC<RegisterSquadModalProps> = ({
  isOpen,
  tournaments,
  defaultTournamentId,
  teamProfile,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const teamGame = teamProfile?.primaryGame;
  const scopedTournaments = React.useMemo(
    () => (teamGame ? tournaments.filter((t) => t.game === teamGame) : tournaments),
    [tournaments, teamGame]
  );

  const openTournaments = React.useMemo(
    () =>
      scopedTournaments.filter(
        (t) => t.status === 'OPEN' && t.registeredTeams < t.maxTeams
      ),
    [scopedTournaments]
  );

  const [tournamentId, setTournamentId] = useState(
    defaultTournamentId || openTournaments[0]?.id || scopedTournaments[0]?.id || ''
  );
  const [captainIgn, setCaptainIgn] = useState('');
  const [captainContact, setCaptainContact] = useState('');
  const [rosterInput, setRosterInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  useEscapeKey(isOpen && !submitting, onClose);

  React.useEffect(() => {
    if (
      defaultTournamentId &&
      scopedTournaments.some((t) => t.id === defaultTournamentId)
    ) {
      setTournamentId(defaultTournamentId);
    } else if (!tournamentId || !scopedTournaments.some((t) => t.id === tournamentId)) {
      setTournamentId(openTournaments[0]?.id || scopedTournaments[0]?.id || '');
    }
  }, [defaultTournamentId, scopedTournaments, openTournaments, tournamentId]);

  React.useEffect(() => {
    if (isOpen && teamProfile) {
      setName(teamProfile.teamName);
      setTag(teamProfile.teamTag);
      setCaptainIgn(teamProfile.captainIgn);
      setCaptainContact(teamProfile.captainContact);
      const combinedRoster = [...teamProfile.rosterCore, ...teamProfile.rosterSub];
      setRosterInput(combinedRoster.join(', '));
    }
  }, [isOpen, teamProfile]);

  if (!isOpen) return null;

  const selectedTournament =
    scopedTournaments.find((t) => t.id === tournamentId) ||
    tournaments.find((t) => t.id === tournamentId) ||
    scopedTournaments[0];
  const isGameMismatch = Boolean(
    teamGame && selectedTournament && selectedTournament.game !== teamGame
  );
  const isSelectedUnavailable = Boolean(
    !selectedTournament ||
      selectedTournament.status !== 'OPEN' ||
      selectedTournament.registeredTeams >= selectedTournament.maxTeams
  );
  const parsedRoster = rosterInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGameMismatch && selectedTournament && teamGame) {
      setError(
        `Akun tim Anda terdaftar di cabang ${teamGame}, tidak dapat mendaftar turnamen ${selectedTournament.game}.`
      );
      return;
    }
    if (isSelectedUnavailable) {
      setError('Turnamen ini sudah ditutup atau kuota penuh. Pilih turnamen dengan status Dibuka.');
      return;
    }
    if (!name.trim() || !tag.trim() || !captainIgn.trim()) {
      setError('Nama squad, tag (maks 5 huruf), dan Nickname / ID Kapten wajib diisi.');
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Selesaikan verifikasi keamanan anti-bot terlebih dahulu.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const finalRoster = parsedRoster.length > 0 ? parsedRoster : [captainIgn.trim()];
      await onSubmit({
        name: name.trim(),
        tag: tag.trim().toUpperCase().slice(0, 5),
        tournamentId: selectedTournament?.id || 'trn-001',
        captainIgn: captainIgn.trim(),
        captainContact: captainContact.trim(),
        roster: finalRoster,
        ...(captchaToken ? { captchaToken } : {}),
      });
      setName('');
      setTag('');
      setCaptainIgn('');
      setCaptainContact('');
      setRosterInput('');
      setCaptchaToken('');
      onClose();
    } catch (err) {
      setCaptchaToken('');
      setCaptchaResetSignal((c) => c + 1);
      setError(err instanceof Error ? err.message : 'Gagal mendaftarkan squad.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#1A202C] border border-white/15 rounded-[6px]">
        <div className="flex items-center justify-between px-6 py-4 bg-[#12161F] border-b border-white/[0.08]">
          <div>
            <h3 className="font-display text-xl font-bold uppercase tracking-[0.02em] text-[#F8FAFC]">
              Register Squad — Pendaftaran Cepat
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Pendaftaran langsung masuk ke sistem seeding dan daftar peserta turnamen ORDAL.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form pendaftaran"
            className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {teamGame && (
            <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/35 rounded-[4px] font-telemetry text-[11px] text-[#E2E2E8]">
              Divisi Tim Terdaftar: <strong className="text-[#00F0FF]">{teamGame}</strong> · Hanya
              turnamen cabang <strong>{teamGame}</strong> yang dapat didaftarkan oleh akun tim ini.
            </div>
          )}

          {error && (
            <div className="p-3 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] text-xs text-[#FFDADB]">
              {error}
            </div>
          )}

          <div>
            <label className="block font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
              Pilih Turnamen {teamGame ? `(${teamGame})` : ''}
            </label>
            {scopedTournaments.length === 0 ? (
              <div className="p-3.5 bg-[#0A0C10] border border-[#FF2E5B]/40 rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                Belum ada turnamen aktif untuk cabang {teamGame}.
              </div>
            ) : (
              <>
                <select
                  value={tournamentId}
                  onChange={(e) => {
                    setTournamentId(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                >
                  {scopedTournaments.map((t) => {
                    const remaining = Math.max(0, t.maxTeams - t.registeredTeams);
                    const disabled = t.status !== 'OPEN' || remaining === 0;
                    const statusText =
                      t.status === 'COMPLETED'
                        ? 'Selesai'
                        : t.status === 'ONGOING'
                          ? 'Berlangsung'
                          : remaining === 0
                            ? 'Penuh'
                            : `Dibuka · Sisa ${remaining} slot`;
                    return (
                      <option key={t.id} value={t.id} disabled={disabled}>
                        {t.name} ({t.game}) — [{statusText}]
                      </option>
                    );
                  })}
                </select>
                {selectedTournament && (
                  <div className="mt-2 px-3 py-2 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] flex flex-wrap items-center justify-between gap-2 font-telemetry text-[11px] text-[#94A3B8]">
                    <span>
                      Biaya: <strong className="text-[#CCFF00]">{selectedTournament.registrationFee || 'GRATIS (FREE)'}</strong>
                    </span>
                    <span>
                      Slot: <strong className="text-[#F8FAFC] tabular-nums">{selectedTournament.registeredTeams}/{selectedTournament.maxTeams} Tim</strong>
                    </span>
                    <span>{selectedTournament.startDate}</span>
                  </div>
                )}
              </>
            )}
            {isGameMismatch && selectedTournament && teamGame ? (
              <p className="mt-1.5 font-telemetry text-[11px] text-[#FF2E5B]">
                Akun tim Anda terdaftar di cabang <strong>{teamGame}</strong>, sehingga tidak dapat mendaftar ke turnamen <strong>{selectedTournament.game}</strong>.
              </p>
            ) : isSelectedUnavailable && scopedTournaments.length > 0 ? (
              <p className="mt-1.5 font-telemetry text-[11px] text-[#FF2E5B]">
                Turnamen yang dipilih sudah ditutup atau kuota penuh. Silakan pilih turnamen berstatus Dibuka.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                Nama Squad
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: GARUDA ESPORTS"
                className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
              />
            </div>
            <div>
              <label className="block font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                Tag (3-5 Huruf)
              </label>
              <input
                type="text"
                maxLength={5}
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                placeholder="GRD"
                className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm uppercase text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                Nickname / ID In-Game Kapten
              </label>
              <input
                type="text"
                value={captainIgn}
                onChange={(e) => setCaptainIgn(e.target.value)}
                placeholder="GRD_Kael / ID 102938"
                className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
              />
            </div>
            <div>
              <label className="block font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                Kontak WhatsApp / Discord
              </label>
              <input
                type="text"
                value={captainContact}
                onChange={(e) => setCaptainContact(e.target.value)}
                placeholder="0812xxxx / discord: kael.grd"
                className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                Daftar Pemain (Pisahkan dengan koma)
              </label>
              <span className="font-telemetry text-[11px] font-bold text-[#00F0FF] tabular-nums">
                {parsedRoster.length > 0 ? `${parsedRoster.length} pemain terisi` : 'Opsional jika 1v1'}
              </span>
            </div>
            <textarea
              rows={2}
              value={rosterInput}
              onChange={(e) => setRosterInput(e.target.value)}
              placeholder="GRD_Kael, GRD_Raka, GRD_Nox, GRD_Vyn, GRD_Zed"
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
            />
          </div>

          <TurnstileWidget onToken={setCaptchaToken} resetSignal={captchaResetSignal} />

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-[#94A3B8]">
              Slot turnamen diamankan melalui verifikasi akun Google.
            </span>
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || isSelectedUnavailable || isGameMismatch}
                className="px-6 py-2.5 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] transition-all disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Menyimpan...' : 'Kirim Pendaftaran'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
