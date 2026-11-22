import React, { useMemo, useState } from 'react';
import { Award, Flame, Medal, Trophy } from 'lucide-react';
import type { ScrimGame, ScrimSession } from '../types';
import { SCRIM_GAMES } from './ScrimArena';

interface TeamLeaderboardEntry {
  teamName: string;
  logo: string;
  games: ScrimGame[];
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  winRate: number;
  scoreDiff: number;
  recentForm: ('W' | 'L' | 'D')[];
}

interface ScrimLeaderboardProps {
  scrims: ScrimSession[];
}

function LeaderboardAvatar({ name, logo }: { name: string; logo?: string }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        referrerPolicy="no-referrer"
        className="w-10 h-10 rounded-full object-cover border border-white/15 bg-[#0A0C10] shrink-0"
      />
    );
  }
  const initials = (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-[#0A0C10] border border-white/15 flex items-center justify-center font-telemetry text-xs font-bold text-[#00F0FF] shrink-0">
      {initials}
    </div>
  );
}

export const ScrimLeaderboard: React.FC<ScrimLeaderboardProps> = ({ scrims }) => {
  const [gameFilter, setGameFilter] = useState<ScrimGame>(SCRIM_GAMES[0]);

  const leaderboard = useMemo<TeamLeaderboardEntry[]>(() => {
    const recorded = scrims.filter(
      (s) =>
        s.resultRecorded &&
        s.hostTeamName &&
        s.challengerTeamName &&
        s.game === gameFilter
    );

    const map = new Map<string, TeamLeaderboardEntry>();

    const ensureTeam = (name: string, logo: string, game: ScrimGame) => {
      const key = name.trim().toUpperCase();
      let entry = map.get(key);
      if (!entry) {
        entry = {
          teamName: key,
          logo: logo || '',
          games: [game],
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          winRate: 0,
          scoreDiff: 0,
          recentForm: [],
        };
        map.set(key, entry);
      } else {
        if (!entry.logo && logo) entry.logo = logo;
        if (!entry.games.includes(game)) entry.games.push(game);
      }
      return entry;
    };

    for (const sc of recorded) {
      const host = ensureTeam(sc.hostTeamName, sc.hostTeamLogo, sc.game);
      const chall = ensureTeam(sc.challengerTeamName, sc.challengerTeamLogo, sc.game);
      const hs = sc.hostScore ?? 0;
      const cs = sc.challengerScore ?? 0;

      host.matches += 1;
      chall.matches += 1;
      host.scoreDiff += hs - cs;
      chall.scoreDiff += cs - hs;

      if (hs > cs) {
        host.wins += 1;
        host.points += 3;
        host.recentForm.push('W');
        chall.losses += 1;
        chall.recentForm.push('L');
      } else if (cs > hs) {
        chall.wins += 1;
        chall.points += 3;
        chall.recentForm.push('W');
        host.losses += 1;
        host.recentForm.push('L');
      } else {
        host.draws += 1;
        host.points += 1;
        host.recentForm.push('D');
        chall.draws += 1;
        chall.points += 1;
        chall.recentForm.push('D');
      }
    }

    const list = Array.from(map.values()).map((entry) => ({
      ...entry,
      winRate: entry.matches > 0 ? Math.round((entry.wins / entry.matches) * 100) : 0,
      recentForm: entry.recentForm.slice(-5),
    }));

    return list.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
      return b.wins - a.wins;
    });
  }, [scrims, gameFilter]);

  const topThree = leaderboard.slice(0, 3);

  return (
    <div id="scrim-leaderboard" className="mt-16 pt-12 border-t border-white/[0.08]">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#CCFF00]">
            SCRIM POWER RANKINGS · WIN +3 PTS · DRAW +1 PT
          </p>
          <h3 className="mt-1 font-display text-3xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC]">
            Team Leaderboard Scrim
          </h3>
        </div>

        {/* Game Filter Tabs */}
        <div className="w-full lg:w-auto overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center gap-1 p-1 bg-[#12161F] border border-white/[0.08] rounded-[4px] min-w-max">
            {SCRIM_GAMES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGameFilter(g)}
                className={`min-h-[38px] px-3 py-1.5 font-telemetry text-xs font-semibold uppercase tracking-[0.06em] rounded-[2px] transition-colors cursor-pointer whitespace-nowrap ${
                  gameFilter === g
                    ? 'bg-[#CCFF00] text-[#0A0C10]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <div className="mt-8 p-10 bg-[#12161F] border border-white/[0.08] rounded-[8px] text-center">
          <Trophy className="w-8 h-8 text-[#94A3B8] mx-auto mb-3" />
          <p className="font-display text-xl uppercase text-[#F8FAFC]">
            Belum Ada Hasil Scrim Tercatat
          </p>
          <p className="mt-1 text-sm text-[#94A3B8]">
            Skor scrim yang dicatat di Dashboard Admin akan otomatis masuk ke klasemen ini.
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium Cards */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
            {topThree.map((team, idx) => {
              const rank = idx + 1;
              const accent =
                rank === 1
                  ? {
                      border: 'border-[#CCFF00]/50',
                      text: 'text-[#CCFF00]',
                      label: 'RANK #1 · TOP CONTENDER',
                      Icon: Trophy,
                    }
                  : rank === 2
                    ? {
                        border: 'border-[#00F0FF]/45',
                        text: 'text-[#00F0FF]',
                        label: 'RANK #2 · CHALLENGER',
                        Icon: Medal,
                      }
                    : {
                        border: 'border-[#FF2E5B]/45',
                        text: 'text-[#FF2E5B]',
                        label: 'RANK #3 · RISING SQUAD',
                        Icon: Award,
                      };
              const RankIcon = accent.Icon;

              return (
                <div
                  key={team.teamName}
                  className={`p-5 bg-[#12161F] border ${accent.border} rounded-[8px] flex flex-col justify-between gap-4`}
                >
                  <div className="flex items-center justify-between font-telemetry text-[11px] font-bold uppercase tracking-[0.08em]">
                    <span className={`inline-flex items-center gap-1.5 ${accent.text}`}>
                      <RankIcon className="w-4 h-4" />
                      {accent.label}
                    </span>
                    <span className="text-[#94A3B8]">{team.matches} MATCH</span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <LeaderboardAvatar name={team.teamName} logo={team.logo} />
                    <div className="min-w-0">
                      <div className="font-display text-xl font-bold uppercase text-[#F8FAFC] truncate">
                        {team.teamName}
                      </div>
                      <div className="font-telemetry text-[11px] uppercase text-[#94A3B8] truncate">
                        {team.games.join(' · ')}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.08] grid grid-cols-3 gap-2 font-telemetry">
                    <div>
                      <div className="text-[10px] uppercase text-[#94A3B8]">POIN</div>
                      <div className={`text-lg font-bold tabular-nums ${accent.text}`}>
                        {team.points}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#94A3B8]">W - L</div>
                      <div className="text-lg font-bold text-[#F8FAFC] tabular-nums">
                        {team.wins}-{team.losses}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#94A3B8]">WIN RATE</div>
                      <div className="text-lg font-bold text-[#00F0FF] tabular-nums">
                        {team.winRate}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile Tactical Leaderboard Cards (< md) */}
          <div className="mt-6 space-y-3 md:hidden">
            {leaderboard.map((team, idx) => {
              const rank = idx + 1;
              return (
                <div
                  key={`mobile-${team.teamName}`}
                  className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-display text-lg font-bold tabular-nums shrink-0 ${
                          rank === 1
                            ? 'text-[#CCFF00]'
                            : rank === 2
                              ? 'text-[#00F0FF]'
                              : rank === 3
                                ? 'text-[#FF2E5B]'
                                : 'text-[#94A3B8]'
                        }`}
                      >
                        #{rank}
                      </span>
                      <LeaderboardAvatar name={team.teamName} logo={team.logo} />
                      <div className="min-w-0">
                        <div className="font-display text-base font-bold uppercase text-[#F8FAFC] truncate flex items-center gap-1">
                          <span className="truncate">{team.teamName}</span>
                          {team.winRate === 100 && team.wins >= 2 && (
                            <Flame className="w-3.5 h-3.5 text-[#FF2E5B] shrink-0" />
                          )}
                        </div>
                        <div className="font-telemetry text-[10px] uppercase text-[#94A3B8] truncate">
                          {team.games.join(' · ')}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-telemetry text-[10px] uppercase text-[#94A3B8]">POIN</div>
                      <div className="font-display text-xl font-bold text-[#CCFF00] tabular-nums leading-none">
                        {team.points}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-white/[0.06] grid grid-cols-3 gap-2 font-telemetry text-xs">
                    <div>
                      <div className="text-[10px] text-[#94A3B8] uppercase">W / D / L</div>
                      <div className="font-bold tabular-nums">
                        <span className="text-[#CCFF00]">{team.wins}</span>/
                        <span className="text-[#94A3B8]">{team.draws}</span>/
                        <span className="text-[#FF2E5B]">{team.losses}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#94A3B8] uppercase">WIN RATE</div>
                      <div className="font-bold text-[#00F0FF] tabular-nums">{team.winRate}%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#94A3B8] uppercase">FORM</div>
                      <div className="mt-0.5 flex items-center justify-end gap-1">
                        {team.recentForm.slice(-3).map((f, i) => (
                          <span
                            key={`mform-${team.teamName}-${i}`}
                            className={`w-4 h-4 rounded-[2px] inline-flex items-center justify-center text-[9px] font-bold ${
                              f === 'W'
                                ? 'bg-[#CCFF00]/15 text-[#CCFF00]'
                                : f === 'L'
                                  ? 'bg-[#FF2E5B]/15 text-[#FF2E5B]'
                                  : 'bg-white/10 text-[#94A3B8]'
                            }`}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full Tactical Leaderboard Table (md+) */}
          <div className="hidden md:block mt-6 bg-[#12161F] border border-white/[0.08] rounded-[8px] overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                  <th className="py-3.5 px-4 w-16">Rank</th>
                  <th className="py-3.5 px-4">Tim &amp; Divisi</th>
                  <th className="py-3.5 px-4 text-center">Match</th>
                  <th className="py-3.5 px-4 text-center">W / D / L</th>
                  <th className="py-3.5 px-4 text-center">Diff</th>
                  <th className="py-3.5 px-4 text-center">Win Rate</th>
                  <th className="py-3.5 px-4 text-center">Form</th>
                  <th className="py-3.5 px-4 text-right">Poin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-telemetry text-sm">
                {leaderboard.map((team, idx) => {
                  const rank = idx + 1;
                  return (
                    <tr key={team.teamName} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-display text-lg font-bold tabular-nums">
                        <span
                          className={
                            rank === 1
                              ? 'text-[#CCFF00]'
                              : rank === 2
                                ? 'text-[#00F0FF]'
                                : rank === 3
                                  ? 'text-[#FF2E5B]'
                                  : 'text-[#94A3B8]'
                          }
                        >
                          #{rank}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <LeaderboardAvatar name={team.teamName} logo={team.logo} />
                          <div>
                            <div className="font-display text-base font-bold uppercase text-[#F8FAFC] flex items-center gap-1.5">
                              <span>{team.teamName}</span>
                              {team.winRate === 100 && team.wins >= 2 && (
                                <Flame
                                  className="w-4 h-4 text-[#FF2E5B]"
                                  aria-label="Win streak"
                                />
                              )}
                            </div>
                            <div className="text-[11px] text-[#94A3B8] uppercase">
                              {team.games.join(' · ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center text-[#F8FAFC] tabular-nums">
                        {team.matches}
                      </td>
                      <td className="py-3.5 px-4 text-center tabular-nums">
                        <span className="text-[#CCFF00] font-bold">{team.wins}</span>
                        <span className="text-white/25 mx-1">/</span>
                        <span className="text-[#94A3B8]">{team.draws}</span>
                        <span className="text-white/25 mx-1">/</span>
                        <span className="text-[#FF2E5B] font-bold">{team.losses}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center tabular-nums">
                        <span
                          className={
                            team.scoreDiff > 0
                              ? 'text-[#00F0FF]'
                              : team.scoreDiff < 0
                                ? 'text-[#FF2E5B]'
                                : 'text-[#94A3B8]'
                          }
                        >
                          {team.scoreDiff > 0 ? `+${team.scoreDiff}` : team.scoreDiff}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#0A0C10] rounded-[2px] overflow-hidden">
                            <div
                              className="h-full bg-[#00F0FF]"
                              style={{ width: `${team.winRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[#F8FAFC] tabular-nums">
                            {team.winRate}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {team.recentForm.map((f, i) => (
                            <span
                              key={`${team.teamName}-form-${i}`}
                              className={`w-5 h-5 rounded-[2px] flex items-center justify-center text-[10px] font-bold ${
                                f === 'W'
                                  ? 'bg-[#CCFF00]/15 text-[#CCFF00] border border-[#CCFF00]/40'
                                  : f === 'L'
                                    ? 'bg-[#FF2E5B]/15 text-[#FF2E5B] border border-[#FF2E5B]/40'
                                    : 'bg-white/10 text-[#94A3B8] border border-white/15'
                              }`}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-display text-xl font-bold text-[#CCFF00] tabular-nums">
                        {team.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
