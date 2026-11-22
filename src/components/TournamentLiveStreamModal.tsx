import React, { useMemo } from 'react';
import {
  Calendar,
  ExternalLink,
  GitBranch,
  MapPin,
  Radio,
  Shield,
  Trophy,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type { AuthUser, Match, Tournament } from '../types';
import type { SquadProfileTarget } from './SquadProfileModal';

function resolveLiveStreamEmbed(rawUrl?: string): {
  embedUrl: string | null;
  providerLabel: string;
  originalUrl: string | null;
} {
  const cleaned = (rawUrl || '').trim();
  if (!cleaned) {
    return { embedUrl: null, providerLabel: 'Official Live Stream', originalUrl: null };
  }
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') {
      return { embedUrl: null, providerLabel: 'Official Live Stream', originalUrl: null };
    }
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    // YouTube: watch?v=, youtu.be/, /live/, /embed/
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      let videoId = parsed.searchParams.get('v');
      if (!videoId && parsed.pathname.startsWith('/live/')) {
        videoId = parsed.pathname.split('/')[2] || null;
      } else if (!videoId && parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2] || null;
      }
      if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
        return {
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`,
          providerLabel: 'YouTube Live Broadcast',
          originalUrl: cleaned,
        };
      }
    }
    if (host === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
        return {
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`,
          providerLabel: 'YouTube Live Broadcast',
          originalUrl: cleaned,
        };
      }
    }

    // Twitch VOD or Live Channel
    if (host === 'twitch.tv') {
      const parentHost =
        typeof window !== 'undefined' && window.location.hostname
          ? window.location.hostname
          : 'localhost';
      if (parsed.pathname.startsWith('/videos/')) {
        const vodId = parsed.pathname.split('/')[2];
        if (vodId && /^\d+$/.test(vodId)) {
          return {
            embedUrl: `https://player.twitch.tv/?video=${vodId}&parent=${encodeURIComponent(parentHost)}&autoplay=true`,
            providerLabel: 'Twitch Broadcast',
            originalUrl: cleaned,
          };
        }
      } else {
        const channel = parsed.pathname.replace(/^\//, '').split('/')[0];
        if (channel && /^[A-Za-z0-9_]{2,32}$/.test(channel)) {
          return {
            embedUrl: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentHost)}&autoplay=true`,
            providerLabel: `Twitch Live · ${channel}`,
            originalUrl: cleaned,
          };
        }
      }
    }

    return { embedUrl: null, providerLabel: 'External Live Stream', originalUrl: cleaned };
  } catch {
    return { embedUrl: null, providerLabel: 'Official Live Stream', originalUrl: null };
  }
}

interface TournamentLiveStreamModalProps {
  tournament: Tournament | null;
  matches: Match[];
  currentUser: AuthUser | null;
  onClose: () => void;
  onOpenBracket: (tournament: Tournament) => void;
  onOpenOverview: (tournament: Tournament) => void;
  onSelectMatch: (match: Match) => void;
  onSelectSquad: (target: SquadProfileTarget) => void;
}

export const TournamentLiveStreamModal: React.FC<TournamentLiveStreamModalProps> = ({
  tournament,
  matches,
  currentUser,
  onClose,
  onOpenBracket,
  onOpenOverview,
  onSelectMatch,
  onSelectSquad,
}) => {
  const tournamentMatches = useMemo(() => {
    if (!tournament) return [];
    return matches
      .filter((m) => m.tournamentId === tournament.id)
      .sort((a, b) => {
        const order = { LIVE: 0, UPCOMING: 1, FINISHED: 2 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        return a.bracketOrder - b.bracketOrder;
      });
  }, [matches, tournament]);

  const liveMatches = useMemo(
    () => tournamentMatches.filter((m) => m.status === 'LIVE'),
    [tournamentMatches]
  );

  useEscapeKey(Boolean(tournament), onClose);

  if (!tournament) return null;

  const streamUrl = tournament.liveStreamUrl || tournament.replayStreamUrl;
  const stream = resolveLiveStreamEmbed(streamUrl);
  const viewerRolePrefix =
    !currentUser
      ? 'PUBLIC SPECTATOR'
      : currentUser.role === 'SUPER_ADMIN'
        ? 'ADMIN VIEWER'
        : currentUser.role === 'LEAGUE_OPS'
          ? 'LEAGUE OPS VIEWER'
          : currentUser.role === 'CASTER'
            ? 'CASTER VIEWER'
            : 'TEAM VIEWER';
  const viewerNameLabel =
    !currentUser
      ? 'Akses Terbuka'
      : currentUser.role === 'TEAM'
        ? currentUser.teamProfile?.teamName || currentUser.displayName
        : currentUser.displayName || 'Viewer';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Live Stream ${tournament.name}`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl bg-[#0D1017] border border-[#FF2E5B]/35 rounded-[6px] shadow-[0_0_50px_rgba(255,46,91,0.18)] overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Broadcast Header */}
        <div className="px-5 sm:px-6 py-4 bg-[#12161F] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.1em]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FF2E5B]/15 border border-[#FF2E5B]/45 text-[#FF2E5B] rounded-[4px]">
                <span className="w-2 h-2 rounded-full bg-[#FF2E5B] animate-pulse" />
                ONGOING LIVE STREAM
              </span>
              <span className="text-[#00F0FF]">
                {tournament.game} · {tournament.format}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] rounded-[4px]">
                <Shield className="w-3 h-3" />
                {viewerRolePrefix}: {viewerNameLabel}
              </span>
            </div>
            <h2 className="mt-2 font-display text-xl sm:text-2xl font-bold uppercase tracking-[0.02em] text-[#F8FAFC] truncate">
              {tournament.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-[4px] bg-white/[0.05] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/30 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Tutup Live Stream"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: 16:9 Live Broadcast Player */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="bg-[#0A0C10] border border-white/[0.08] rounded-[6px] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#12161F] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#F8FAFC]">
                  <Radio className="w-4 h-4 text-[#FF2E5B]" />
                  <span>{stream.providerLabel}</span>
                </div>
                {stream.originalUrl && (
                  <a
                    href={stream.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#00F0FF] hover:underline"
                  >
                    Buka di Tab Baru
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {stream.embedUrl ? (
                <div className="relative w-full aspect-video bg-black">
                  <iframe
                    src={stream.embedUrl}
                    title={`Live Stream ${tournament.name}`}
                    className="absolute inset-0 w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              ) : stream.originalUrl ? (
                <div className="aspect-video flex flex-col items-center justify-center p-8 text-center bg-[#0A0C10]">
                  <Tv className="w-10 h-10 text-[#FF2E5B] mb-3" />
                  <p className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                    Siaran Langsung Tersedia di Platform Eksternal
                  </p>
                  <p className="mt-1.5 text-sm text-[#94A3B8] max-w-md">
                    Provider siaran ini tidak mendukung pemutaran embed langsung. Klik tombol di bawah untuk menonton siaran resmi.
                  </p>
                  <a
                    href={stream.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF2E5B] text-white font-display text-sm font-bold uppercase tracking-[0.06em] rounded-[4px] hover:bg-[#ff476e] transition-colors"
                  >
                    Tonton Siaran Langsung
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ) : (
                <div className="aspect-video flex flex-col items-center justify-center p-8 text-center bg-[#0A0C10]">
                  <Tv className="w-10 h-10 text-[#64748B] mb-3" />
                  <p className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                    Link Live Stream Belum Diatur Admin
                  </p>
                  <p className="mt-1.5 text-sm text-[#94A3B8] max-w-md">
                    Turnamen sedang berlangsung. Pantau skor langsung melalui Live Bracket sambil menunggu broadcast resmi aktif.
                  </p>
                </div>
              )}
            </div>

            {/* Tournament Broadcast Info Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-telemetry text-xs">
              <div className="p-3 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
                <p className="text-[#94A3B8] inline-flex items-center gap-1.5 uppercase">
                  <Trophy className="w-3.5 h-3.5 text-[#CCFF00]" /> Prize Pool
                </p>
                <p className="mt-1 font-bold text-[#CCFF00] truncate">{tournament.prizePool}</p>
              </div>
              <div className="p-3 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
                <p className="text-[#94A3B8] inline-flex items-center gap-1.5 uppercase">
                  <Calendar className="w-3.5 h-3.5 text-[#00F0FF]" /> Kick-Off
                </p>
                <p className="mt-1 font-bold text-[#F8FAFC] truncate">{tournament.startDate}</p>
              </div>
              <div className="p-3 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
                <p className="text-[#94A3B8] inline-flex items-center gap-1.5 uppercase">
                  <MapPin className="w-3.5 h-3.5 text-[#00F0FF]" /> Region
                </p>
                <p className="mt-1 font-bold text-[#F8FAFC] truncate">{tournament.region}</p>
              </div>
              <div className="p-3 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
                <p className="text-[#94A3B8] inline-flex items-center gap-1.5 uppercase">
                  <Users className="w-3.5 h-3.5 text-[#94A3B8]" /> Squads
                </p>
                <p className="mt-1 font-bold text-[#F8FAFC]">
                  {tournament.registeredTeams} / {tournament.maxTeams}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Live Scoreboard & Match Feed */}
          <div className="lg:col-span-4 flex flex-col bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#FF2E5B] animate-pulse" />
                <h3 className="font-display text-sm font-bold uppercase tracking-[0.06em] text-[#F8FAFC]">
                  Live Match Feed
                </h3>
              </div>
              <span className="font-telemetry text-[11px] uppercase text-[#94A3B8]">
                {liveMatches.length} LIVE · {tournamentMatches.length} TOTAL
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 max-h-[380px] lg:max-h-[430px]">
              {tournamentMatches.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#94A3B8] font-telemetry">
                  Belum ada jadwal pertandingan di bracket turnamen ini.
                </div>
              ) : (
                tournamentMatches.map((match) => {
                  const isLive = match.status === 'LIVE';
                  return (
                    <div
                      key={match.id}
                      className={`p-3 rounded-[4px] border transition-colors ${
                        isLive
                          ? 'bg-[#FF2E5B]/[0.07] border-[#FF2E5B]/40'
                          : 'bg-[#0A0C10] border-white/[0.06] hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-telemetry text-[10px] uppercase tracking-[0.08em]">
                        <span className="text-[#94A3B8]">
                          {match.round} · {match.mapName}
                        </span>
                        <span
                          className={
                            isLive
                              ? 'text-[#FF2E5B] font-bold'
                              : match.status === 'UPCOMING'
                                ? 'text-[#00F0FF]'
                                : 'text-[#64748B]'
                          }
                        >
                          {match.status}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onSelectSquad({
                                teamName: match.teamA,
                                teamTag: match.teamATag,
                                tournamentId: match.tournamentId,
                              })
                            }
                            className="text-left font-display text-sm font-bold uppercase text-[#F8FAFC] hover:text-[#00F0FF] truncate cursor-pointer"
                          >
                            [{match.teamATag}] {match.teamA}
                          </button>
                          <span className="font-telemetry text-sm font-bold text-[#CCFF00]">
                            {match.scoreA}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onSelectSquad({
                                teamName: match.teamB,
                                teamTag: match.teamBTag,
                                tournamentId: match.tournamentId,
                              })
                            }
                            className="text-left font-display text-sm font-bold uppercase text-[#F8FAFC] hover:text-[#00F0FF] truncate cursor-pointer"
                          >
                            [{match.teamBTag}] {match.teamB}
                          </button>
                          <span className="font-telemetry text-sm font-bold text-[#CCFF00]">
                            {match.scoreB}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectMatch(match)}
                        className="mt-2.5 w-full py-1.5 px-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-[4px] font-telemetry text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                      >
                        Lihat Telemetri Match
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3.5 border-t border-white/[0.08] bg-[#0A0C10]/60 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBracket(tournament);
                }}
                className="w-full py-2.5 px-4 bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase tracking-[0.06em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.35)] transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Buka Live Bracket
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOverview(tournament);
                }}
                className="w-full py-2 px-4 border border-white/15 text-[#F8FAFC] font-display text-xs font-semibold uppercase tracking-[0.06em] rounded-[4px] hover:border-[#00F0FF] hover:text-[#00F0FF] transition-colors cursor-pointer"
              >
                Detail Turnamen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
