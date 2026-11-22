import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  Award,
  Calendar,
  ExternalLink,
  Flame,
  GitBranch,
  Newspaper,
  Play,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type { Match, NewsArticle, Squad, Tournament } from '../types';
import type { SquadProfileTarget } from './SquadProfileModal';

function resolveReplayEmbed(rawUrl?: string): {
  embedUrl: string | null;
  providerLabel: string;
  originalUrl: string | null;
} {
  const cleaned = (rawUrl || '').trim();
  if (!cleaned) {
    return { embedUrl: null, providerLabel: 'Live Stream Replay', originalUrl: null };
  }
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') {
      return { embedUrl: null, providerLabel: 'Live Stream Replay', originalUrl: null };
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
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
          providerLabel: 'YouTube VOD Replay',
          originalUrl: cleaned,
        };
      }
    }
    if (host === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
        return {
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
          providerLabel: 'YouTube VOD Replay',
          originalUrl: cleaned,
        };
      }
    }

    // Twitch VOD: twitch.tv/videos/<id>
    if (host === 'twitch.tv' && parsed.pathname.startsWith('/videos/')) {
      const vodId = parsed.pathname.split('/')[2];
      if (vodId && /^\d+$/.test(vodId)) {
        const parentHost =
          typeof window !== 'undefined' && window.location.hostname
            ? window.location.hostname
            : 'localhost';
        return {
          embedUrl: `https://player.twitch.tv/?video=${vodId}&parent=${encodeURIComponent(parentHost)}&autoplay=false`,
          providerLabel: 'Twitch VOD Replay',
          originalUrl: cleaned,
        };
      }
    }

    return { embedUrl: null, providerLabel: 'External Stream', originalUrl: cleaned };
  } catch {
    return { embedUrl: null, providerLabel: 'Live Stream Replay', originalUrl: null };
  }
}

interface TournamentHighlightModalProps {
  tournament: Tournament | null;
  matches: Match[];
  squads: Squad[];
  news: NewsArticle[];
  onClose: () => void;
  onOpenBracket: (tournament: Tournament) => void;
  onOpenOverview: (tournament: Tournament) => void;
  onSelectMatch: (match: Match) => void;
  onSelectSquad: (target: SquadProfileTarget) => void;
  onSelectArticle: (article: NewsArticle) => void;
}

export const TournamentHighlightModal: React.FC<TournamentHighlightModalProps> = ({
  tournament,
  matches,
  squads,
  news,
  onClose,
  onOpenBracket,
  onOpenOverview,
  onSelectMatch,
  onSelectSquad,
  onSelectArticle,
}) => {
  const highlights = useMemo(() => {
    if (!tournament) return null;

    const trnMatches = matches.filter((m) => m.tournamentId === tournament.id);
    const finished = trnMatches.filter((m) => m.status === 'FINISHED');
    const trnSquads = squads.filter((s) => s.tournamentId === tournament.id);

    const grandFinal =
      finished.find((m) => m.round === 'GRAND FINAL') ||
      trnMatches.find((m) => m.round === 'GRAND FINAL');

    let championName: string | null = null;
    let championTag: string | null = null;
    let runnerUpName: string | null = null;
    let runnerUpTag: string | null = null;

    if (grandFinal && grandFinal.status === 'FINISHED') {
      const aWon =
        (grandFinal.winnerTag && grandFinal.winnerTag === grandFinal.teamATag) ||
        grandFinal.scoreA >= grandFinal.scoreB;
      championName = aWon ? grandFinal.teamA : grandFinal.teamB;
      championTag = aWon ? grandFinal.teamATag : grandFinal.teamBTag;
      runnerUpName = aWon ? grandFinal.teamB : grandFinal.teamA;
      runnerUpTag = aWon ? grandFinal.teamBTag : grandFinal.teamATag;
    }

    // Determine Tournament MVP (most frequent MVP IGN across finished matches, fallback to GF MVP)
    const mvpCounts = new Map<string, number>();
    for (const m of finished) {
      if (m.mvpIgn) {
        mvpCounts.set(m.mvpIgn, (mvpCounts.get(m.mvpIgn) || 0) + 1);
      }
    }
    let topMvp: { ign: string; count: number } | null = null;
    for (const [ign, count] of mvpCounts.entries()) {
      if (!topMvp || count > topMvp.count) {
        topMvp = { ign, count };
      }
    }
    if (!topMvp && grandFinal?.mvpIgn) {
      topMvp = { ign: grandFinal.mvpIgn, count: 1 };
    }

    // Closest match (smallest score margin) & Most Dominant victory (largest score margin)
    let clutchMatch: Match | null = null;
    let dominantMatch: Match | null = null;
    for (const m of finished) {
      const diff = Math.abs(m.scoreA - m.scoreB);
      if (!clutchMatch || diff < Math.abs(clutchMatch.scoreA - clutchMatch.scoreB)) {
        clutchMatch = m;
      }
      if (!dominantMatch || diff > Math.abs(dominantMatch.scoreA - dominantMatch.scoreB)) {
        dominantMatch = m;
      }
    }

    const totalRoundsScored = finished.reduce((acc, m) => acc + m.scoreA + m.scoreB, 0);

    // Related news recaps (prefer TOURNAMENT RECAP or matching game/title)
    const gameKeyword = tournament.game.toLowerCase();
    const relatedNews = news
      .filter(
        (n) =>
          n.category === 'TOURNAMENT RECAP' ||
          n.title.toLowerCase().includes(gameKeyword) ||
          n.excerpt.toLowerCase().includes(gameKeyword)
      )
      .slice(0, 3);

    // Standout match list: Grand Final -> Semifinals -> remaining finished
    const roundRank: Record<Match['round'], number> = {
      'GRAND FINAL': 0,
      SEMIFINAL: 1,
      QUARTERFINAL: 2,
    };
    const keyMatches = [...finished]
      .sort((a, b) => roundRank[a.round] - roundRank[b.round])
      .slice(0, 5);

    return {
      trnMatches,
      finished,
      trnSquads,
      grandFinal,
      championName,
      championTag,
      runnerUpName,
      runnerUpTag,
      topMvp,
      clutchMatch,
      dominantMatch,
      totalRoundsScored,
      relatedNews,
      keyMatches,
    };
  }, [tournament, matches, squads, news]);

  useEscapeKey(Boolean(tournament), onClose);

  if (!tournament || !highlights) return null;

  const replay = resolveReplayEmbed(tournament.replayStreamUrl);

  const {
    finished,
    grandFinal,
    championName,
    championTag,
    runnerUpName,
    runnerUpTag,
    topMvp,
    clutchMatch,
    dominantMatch,
    totalRoundsScored,
    relatedNews,
    keyMatches,
  } = highlights;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#0A0C10]/88 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Highlight Turnamen ${tournament.name}`}
    >
      <div className="w-full max-w-4xl max-h-[92vh] bg-[#12161F] border border-white/12 rounded-[8px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-7 py-5 bg-[#0A0C10] border-b border-white/[0.08] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-telemetry text-[11px] font-semibold uppercase tracking-[0.1em] text-[#CCFF00]">
              <span>Tournament Highlight</span>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <span className="text-[#00F0FF]">{tournament.game}</span>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <span className="text-[#94A3B8]">{tournament.region}</span>
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC] leading-tight">
              {tournament.name}
            </h2>
            <p className="mt-1.5 text-sm text-[#94A3B8] max-w-2xl leading-relaxed">
              {tournament.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup highlight turnamen"
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center border border-white/12 rounded-[4px] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/25 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {/* Podium / Champion Spotlight when Grand Final exists */}
          {championName ? (
            <div className="p-5 sm:p-6 bg-[#0A0C10] border border-[#CCFF00]/35 rounded-[6px] grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              <div className="md:col-span-7 space-y-2">
                <div className="inline-flex items-center gap-2 font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-[#CCFF00]">
                  <Trophy className="w-4 h-4" />
                  Champion · Grand Final Winner
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelectSquad({
                      teamName: championName,
                      teamTag: championTag || undefined,
                      tournamentId: tournament.id,
                    })
                  }
                  className="group flex items-center gap-2 text-left cursor-pointer"
                >
                  <span className="font-display text-3xl sm:text-4xl font-bold uppercase text-[#F8FAFC] group-hover:text-[#00F0FF] transition-colors">
                    {championName}
                  </span>
                  <ArrowUpRight className="w-5 h-5 text-[#00F0FF] opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
                {grandFinal && (
                  <p className="font-telemetry text-xs text-[#94A3B8] tabular-nums">
                    Grand Final Score: {grandFinal.teamATag} {grandFinal.scoreA} -{' '}
                    {grandFinal.scoreB} {grandFinal.teamBTag} · Map {grandFinal.mapName}
                  </p>
                )}
              </div>

              <div className="md:col-span-5 grid grid-cols-2 gap-3 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-white/[0.08] md:pl-5">
                <div>
                  <div className="font-telemetry text-[11px] uppercase text-[#94A3B8]">
                    Runner-Up
                  </div>
                  {runnerUpName ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSquad({
                          teamName: runnerUpName,
                          teamTag: runnerUpTag || undefined,
                          tournamentId: tournament.id,
                        })
                      }
                      className="mt-1 font-display text-base font-bold uppercase text-[#F8FAFC] hover:text-[#00F0FF] text-left transition-colors cursor-pointer"
                    >
                      {runnerUpName}
                    </button>
                  ) : (
                    <div className="mt-1 font-display text-base font-bold text-[#94A3B8]">—</div>
                  )}
                </div>
                <div>
                  <div className="font-telemetry text-[11px] uppercase text-[#94A3B8]">
                    Tournament MVP
                  </div>
                  <div className="mt-1 font-telemetry text-sm font-bold text-[#00F0FF] truncate">
                    {topMvp ? topMvp.ign : '—'}
                  </div>
                  {topMvp && topMvp.count > 1 && (
                    <div className="font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
                      {topMvp.count}x Match MVP
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 sm:p-6 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
                  <Trophy className="w-4 h-4" />
                  Turnamen Selesai · Arsip Highlight
                </div>
                <p className="text-sm text-[#E2E2E8] leading-relaxed">
                  {tournament.name} telah resmi berakhir dengan total hadiah{' '}
                  <span className="font-semibold text-[#CCFF00]">{tournament.prizePool}</span> dan{' '}
                  <span className="font-semibold text-[#F8FAFC] tabular-nums">
                    {tournament.registeredTeams} squad
                  </span>{' '}
                  peserta.
                </p>
              </div>
              <div className="font-telemetry text-xs text-[#94A3B8] shrink-0 space-y-1 sm:text-right">
                <div className="text-[#F8FAFC] font-semibold">{tournament.format}</div>
                <div>Kick-Off: {tournament.startDate}</div>
              </div>
            </div>
          )}

          {/* Siaran Ulang Live Stream (VOD Replay) */}
          <div className="bg-[#0A0C10] border border-white/[0.08] rounded-[6px] overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-[#FF2E5B]" />
                <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                  Siaran Ulang Live Stream
                </h3>
                <span className="font-telemetry text-[11px] text-[#94A3B8]">
                  · {replay.providerLabel}
                </span>
              </div>
              {replay.originalUrl && (
                <a
                  href={replay.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-telemetry text-xs font-semibold text-[#00F0FF] hover:underline whitespace-nowrap shrink-0"
                >
                  Tonton di Platform Asli
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {replay.embedUrl ? (
              <div className="relative w-full aspect-video bg-black">
                <iframe
                  src={replay.embedUrl}
                  title={`Siaran Ulang Live Stream ${tournament.name}`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : replay.originalUrl ? (
              <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                    Rekaman Siaran Tersedia di Tautan Eksternal
                  </p>
                  <p className="mt-1 font-telemetry text-xs text-[#94A3B8]">
                    Klik tombol di samping untuk memutar siaran ulang resmi turnamen ini.
                  </p>
                </div>
                <a
                  href={replay.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[40px] bg-[#FF2E5B] text-white font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                >
                  <Play className="w-4 h-4" />
                  Putar Siaran Ulang
                </a>
              </div>
            ) : (
              <div className="p-6 text-center space-y-1.5">
                <p className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                  Siaran Ulang Belum Tersedia
                </p>
                <p className="font-telemetry text-xs text-[#94A3B8] max-w-md mx-auto">
                  Panitia belum menambahkan tautan VOD YouTube/Twitch untuk turnamen ini. Super Admin dapat menambahkannya melalui menu edit turnamen di Admin Dashboard.
                </p>
              </div>
            )}
          </div>

          {/* 4-Column Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-xs text-[#94A3B8] inline-flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-[#CCFF00]" />
                Prize Pool
              </div>
              <div className="mt-1.5 font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
                {tournament.prizePool}
              </div>
              <div className="mt-0.5 font-telemetry text-[11px] text-[#94A3B8]">
                {tournament.prizeFirst ? `Juara 1: ${tournament.prizeFirst}` : 'Distributed'}
              </div>
            </div>

            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-xs text-[#94A3B8] inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#00F0FF]" />
                Peserta
              </div>
              <div className="mt-1.5 font-display text-2xl font-bold text-[#F8FAFC] tabular-nums">
                {tournament.registeredTeams} / {tournament.maxTeams}
              </div>
              <div className="mt-0.5 font-telemetry text-[11px] text-[#94A3B8]">
                Squad Terdaftar
              </div>
            </div>

            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-xs text-[#94A3B8] inline-flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-[#FF2E5B]" />
                Match Selesai
              </div>
              <div className="mt-1.5 font-display text-2xl font-bold text-[#F8FAFC] tabular-nums">
                {finished.length}
              </div>
              <div className="mt-0.5 font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
                {totalRoundsScored > 0
                  ? `${totalRoundsScored} total poin/ronde`
                  : tournament.format}
              </div>
            </div>

            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-xs text-[#94A3B8] inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                Tanggal Event
              </div>
              <div className="mt-1.5 font-display text-xl font-bold text-[#F8FAFC] truncate">
                {tournament.startDate}
              </div>
              <div className="mt-0.5 font-telemetry text-[11px] text-[#94A3B8]">
                {tournament.organizer || 'ORDAL Official'}
              </div>
            </div>
          </div>

          {/* Standout Moments: Clutch Match & Dominant Victory */}
          {(clutchMatch || dominantMatch) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clutchMatch && (
                <button
                  type="button"
                  onClick={() => onSelectMatch(clutchMatch)}
                  className="p-4 bg-[#0A0C10] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[6px] text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 font-telemetry text-[11px] uppercase text-[#00F0FF] font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Match Tersengit (Clutch)
                    </span>
                    <span className="text-[#94A3B8]">{clutchMatch.round}</span>
                  </div>
                  <div className="mt-2 font-display text-xl font-bold uppercase text-[#F8FAFC] tabular-nums">
                    {clutchMatch.teamA}{' '}
                    <span className="text-[#CCFF00]">
                      {clutchMatch.scoreA} - {clutchMatch.scoreB}
                    </span>{' '}
                    {clutchMatch.teamB}
                  </div>
                  <div className="mt-1 font-telemetry text-xs text-[#94A3B8]">
                    Map {clutchMatch.mapName}
                    {clutchMatch.mvpIgn ? ` · MVP: ${clutchMatch.mvpIgn}` : ''}
                  </div>
                </button>
              )}

              {dominantMatch && dominantMatch.id !== clutchMatch?.id && (
                <button
                  type="button"
                  onClick={() => onSelectMatch(dominantMatch)}
                  className="p-4 bg-[#0A0C10] border border-white/[0.08] hover:border-[#CCFF00]/50 rounded-[6px] text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 font-telemetry text-[11px] uppercase text-[#CCFF00] font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5" />
                      Kemenangan Paling Dominan
                    </span>
                    <span className="text-[#94A3B8]">{dominantMatch.round}</span>
                  </div>
                  <div className="mt-2 font-display text-xl font-bold uppercase text-[#F8FAFC] tabular-nums">
                    {dominantMatch.teamA}{' '}
                    <span className="text-[#00F0FF]">
                      {dominantMatch.scoreA} - {dominantMatch.scoreB}
                    </span>{' '}
                    {dominantMatch.teamB}
                  </div>
                  <div className="mt-1 font-telemetry text-xs text-[#94A3B8]">
                    Map {dominantMatch.mapName}
                    {dominantMatch.mvpIgn ? ` · MVP: ${dominantMatch.mvpIgn}` : ''}
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Key Match Results Table */}
          {keyMatches.length > 0 && (
            <div className="border-t border-white/[0.08] pt-5 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  Sorotan Pertandingan
                </h3>
                <span className="font-telemetry text-xs text-[#94A3B8] tabular-nums">
                  {keyMatches.length} pertandingan utama
                </span>
              </div>
              <div className="overflow-x-auto border border-white/[0.08] rounded-[6px] bg-[#0A0C10]">
                <table className="w-full text-left border-collapse min-w-[540px]">
                  <thead>
                    <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                      <th className="py-2.5 px-4 font-semibold">Babak</th>
                      <th className="py-2.5 px-4 font-semibold">Matchup</th>
                      <th className="py-2.5 px-4 font-semibold">Map</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Skor</th>
                      <th className="py-2.5 px-4 font-semibold text-right">MVP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-telemetry text-xs">
                    {keyMatches.map((m) => (
                      <tr
                        key={m.id}
                        onClick={() => onSelectMatch(m)}
                        className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 text-[#00F0FF] font-semibold">{m.round}</td>
                        <td className="py-3 px-4 text-[#F8FAFC] font-semibold">
                          {m.teamA} <span className="text-[#94A3B8]">vs</span> {m.teamB}
                        </td>
                        <td className="py-3 px-4 text-[#94A3B8]">{m.mapName}</td>
                        <td className="py-3 px-4 text-right font-bold text-[#CCFF00] tabular-nums">
                          {m.scoreA} - {m.scoreB}
                        </td>
                        <td className="py-3 px-4 text-right text-[#94A3B8]">
                          {m.mvpIgn || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Related Recap Articles */}
          {relatedNews.length > 0 && (
            <div className="border-t border-white/[0.08] pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#CCFF00]" />
                <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  Recap &amp; Artikel Terkait
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {relatedNews.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => onSelectArticle(article)}
                    className="p-4 bg-[#0A0C10] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[6px] text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-telemetry text-[10px] font-semibold uppercase text-[#CCFF00]">
                        {article.category} · {article.readTime}
                      </div>
                      <div className="mt-1.5 font-display text-base font-bold uppercase text-[#F8FAFC] leading-snug line-clamp-2">
                        {article.title}
                      </div>
                    </div>
                    <div className="font-telemetry text-[11px] text-[#00F0FF] inline-flex items-center gap-1">
                      Baca Recap
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-7 py-4 bg-[#0A0C10] border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenOverview(tournament);
            }}
            className="px-4 min-h-[40px] border border-white/15 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/30 font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] transition-colors cursor-pointer"
          >
            Detail Turnamen
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBracket(tournament);
              }}
              className="inline-flex items-center gap-1.5 px-4 min-h-[40px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] transition-all cursor-pointer"
            >
              <GitBranch className="w-4 h-4" />
              Lihat Hasil Bracket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
