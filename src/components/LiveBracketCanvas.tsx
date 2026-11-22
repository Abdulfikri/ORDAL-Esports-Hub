import React, { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import type { BracketRound, Match, MatchStatus } from '../types';

interface LiveBracketCanvasProps {
  matches: Match[];
  onSelectMatch: (match: Match) => void;
  onSelectSquad?: (teamName: string, teamTag: string) => void;
  canEdit?: boolean;
  onUpdateMatch?: (matchId: string, patch: Partial<Match>) => Promise<void>;
}

function isInspectableTeam(name?: string): boolean {
  const n = (name || '').trim().toUpperCase();
  return Boolean(n) && n !== 'TBD' && n !== 'TBA' && n !== 'BYE';
}

const MatchNodeCard: React.FC<{
  match: Match;
  onSelect: () => void;
  onSelectSquad?: (teamName: string, teamTag: string) => void;
  fullWidth?: boolean;
  canEdit?: boolean;
  busy?: boolean;
  onQuickPatch?: (matchId: string, patch: Partial<Match>) => void;
  onOpenQuickEdit?: (match: Match) => void;
}> = ({
  match,
  onSelect,
  onSelectSquad,
  fullWidth = false,
  canEdit = false,
  busy = false,
  onQuickPatch,
  onOpenQuickEdit,
}) => {
  const isFinished = match.status === 'FINISHED';
  const isLive = match.status === 'LIVE';
  const aWon = isFinished && match.winnerTag === match.teamATag;
  const bWon = isFinished && match.winnerTag === match.teamBTag;
  const canInspectA = Boolean(onSelectSquad) && isInspectableTeam(match.teamA);
  const canInspectB = Boolean(onSelectSquad) && isInspectableTeam(match.teamB);

  return (
    <div
      className={`${
        fullWidth ? 'w-full' : 'w-[258px]'
      } text-left bg-[#12161F] border rounded-[6px] overflow-hidden transition-all duration-200 hover:bg-[#1A202C] ${
        isLive
          ? 'border-[#FF2E5B]/60 glow-crimson'
          : 'border-white/[0.08] hover:border-[#00F0FF]/50'
      } ${busy ? 'opacity-70 pointer-events-none' : ''}`}
    >
      {/* Top micro metadata bar */}
      <div className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-[#0A0C10]/70 border-b border-white/[0.06] font-telemetry text-[10px] uppercase tracking-[0.06em]">
        <button
          type="button"
          onClick={onSelect}
          title="Lihat detail pertandingan"
          className="text-[#94A3B8] hover:text-[#00F0FF] truncate text-left cursor-pointer focus-visible:outline-none"
        >
          {match.mapName}
        </button>

        {canEdit && onQuickPatch ? (
          <div className="flex items-center gap-1 shrink-0">
            <select
              aria-label={`Status match ${match.teamATag} vs ${match.teamBTag}`}
              value={match.status}
              onChange={(e) =>
                onQuickPatch(match.id, { status: e.target.value as MatchStatus })
              }
              className={`bg-[#12161F] border border-white/15 rounded-[2px] px-1 py-0.5 text-[10px] font-bold uppercase cursor-pointer focus:outline-none focus:border-[#00F0FF] ${
                isLive
                  ? 'text-[#FF2E5B]'
                  : isFinished
                    ? 'text-[#00F0FF]'
                    : 'text-[#94A3B8]'
              }`}
            >
              <option value="UPCOMING">UPCOMING</option>
              <option value="LIVE">LIVE</option>
              <option value="FINISHED">FINISHED</option>
            </select>
            {onOpenQuickEdit && (
              <button
                type="button"
                onClick={() => onOpenQuickEdit(match)}
                title="Edit skor, map & MVP"
                aria-label="Edit detail match"
                className="p-1 rounded-[2px] text-[#94A3B8] hover:text-[#00F0FF] hover:bg-white/[0.06] cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="shrink-0 cursor-pointer focus-visible:outline-none"
          >
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 text-[#FF2E5B] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF2E5B] live-dot-pulse" />
                LIVE
              </span>
            ) : (
              <span className={isFinished ? 'text-[#00F0FF] font-semibold' : 'text-[#94A3B8]'}>
                {match.status}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Team A Row */}
      <div
        className={`flex items-center justify-between px-2.5 py-2 border-b border-white/[0.06] transition-opacity ${
          aWon
            ? 'border-l-[3px] border-l-[#00F0FF] bg-[#00F0FF]/[0.04]'
            : bWon
              ? 'opacity-50'
              : ''
        }`}
      >
        <button
          type="button"
          onClick={() =>
            canInspectA ? onSelectSquad?.(match.teamA, match.teamATag) : onSelect()
          }
          title={canInspectA ? `Lihat Squad Profile ${match.teamA}` : 'Lihat detail pertandingan'}
          className="flex items-center gap-2 min-w-0 flex-1 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00F0FF] rounded-[2px]"
        >
          <span className="w-6 h-6 rounded-full bg-[#0A0C10] border border-white/10 group-hover:border-[#00F0FF]/60 flex items-center justify-center font-telemetry text-[10px] font-bold text-[#F8FAFC] shrink-0 transition-colors">
            {match.teamATag.slice(0, 3)}
          </span>
          <span
            className={`font-telemetry text-xs tracking-[0.04em] truncate transition-colors ${
              canInspectA ? 'group-hover:text-[#00F0FF]' : ''
            } ${aWon ? 'text-[#F8FAFC] font-bold' : 'text-[#E2E2E8] font-semibold'}`}
          >
            {match.teamA}
          </span>
        </button>

        {canEdit && onQuickPatch ? (
          <div className="flex items-center gap-1 ml-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onQuickPatch(match.id, { scoreA: Math.max(0, match.scoreA - 1) })
              }
              title={`Kurangi skor ${match.teamA}`}
              className="w-5 h-5 flex items-center justify-center bg-[#0A0C10] border border-white/15 hover:border-[#FF2E5B] text-[11px] font-bold text-[#94A3B8] hover:text-[#F8FAFC] rounded-[2px] cursor-pointer"
            >
              -
            </button>
            <span
              className={`font-telemetry text-xs font-bold min-w-[20px] text-center tabular-nums ${
                aWon ? 'text-[#00F0FF]' : 'text-[#F8FAFC]'
              }`}
            >
              {match.scoreA}
            </span>
            <button
              type="button"
              onClick={() => onQuickPatch(match.id, { scoreA: match.scoreA + 1 })}
              title={`Tambah skor ${match.teamA}`}
              className="w-5 h-5 flex items-center justify-center bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] text-[11px] font-bold text-[#94A3B8] hover:text-[#00F0FF] rounded-[2px] cursor-pointer"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            title="Lihat detail pertandingan"
            className={`font-telemetry text-sm font-bold px-2 py-0.5 rounded-[2px] ml-2 shrink-0 cursor-pointer tabular-nums ${
              aWon
                ? 'text-[#00F0FF] bg-[#00F0FF]/15 shadow-[0_0_10px_rgba(0,240,255,0.28)]'
                : 'text-[#F8FAFC] hover:text-[#00F0FF]'
            }`}
          >
            {match.scoreA}
          </button>
        )}
      </div>

      {/* Team B Row */}
      <div
        className={`flex items-center justify-between px-2.5 py-2 transition-opacity ${
          bWon
            ? 'border-l-[3px] border-l-[#00F0FF] bg-[#00F0FF]/[0.04]'
            : aWon
              ? 'opacity-50'
              : ''
        }`}
      >
        <button
          type="button"
          onClick={() =>
            canInspectB ? onSelectSquad?.(match.teamB, match.teamBTag) : onSelect()
          }
          title={canInspectB ? `Lihat Squad Profile ${match.teamB}` : 'Lihat detail pertandingan'}
          className="flex items-center gap-2 min-w-0 flex-1 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00F0FF] rounded-[2px]"
        >
          <span className="w-6 h-6 rounded-full bg-[#0A0C10] border border-white/10 group-hover:border-[#00F0FF]/60 flex items-center justify-center font-telemetry text-[10px] font-bold text-[#F8FAFC] shrink-0 transition-colors">
            {match.teamBTag.slice(0, 3)}
          </span>
          <span
            className={`font-telemetry text-xs tracking-[0.04em] truncate transition-colors ${
              canInspectB ? 'group-hover:text-[#00F0FF]' : ''
            } ${bWon ? 'text-[#F8FAFC] font-bold' : 'text-[#E2E2E8] font-semibold'}`}
          >
            {match.teamB}
          </span>
        </button>

        {canEdit && onQuickPatch ? (
          <div className="flex items-center gap-1 ml-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onQuickPatch(match.id, { scoreB: Math.max(0, match.scoreB - 1) })
              }
              title={`Kurangi skor ${match.teamB}`}
              className="w-5 h-5 flex items-center justify-center bg-[#0A0C10] border border-white/15 hover:border-[#FF2E5B] text-[11px] font-bold text-[#94A3B8] hover:text-[#F8FAFC] rounded-[2px] cursor-pointer"
            >
              -
            </button>
            <span
              className={`font-telemetry text-xs font-bold min-w-[20px] text-center tabular-nums ${
                bWon ? 'text-[#00F0FF]' : 'text-[#F8FAFC]'
              }`}
            >
              {match.scoreB}
            </span>
            <button
              type="button"
              onClick={() => onQuickPatch(match.id, { scoreB: match.scoreB + 1 })}
              title={`Tambah skor ${match.teamB}`}
              className="w-5 h-5 flex items-center justify-center bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] text-[11px] font-bold text-[#94A3B8] hover:text-[#00F0FF] rounded-[2px] cursor-pointer"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            title="Lihat detail pertandingan"
            className={`font-telemetry text-sm font-bold px-2 py-0.5 rounded-[2px] ml-2 shrink-0 cursor-pointer tabular-nums ${
              bWon
                ? 'text-[#00F0FF] bg-[#00F0FF]/15 shadow-[0_0_10px_rgba(0,240,255,0.28)]'
                : 'text-[#F8FAFC] hover:text-[#00F0FF]'
            }`}
          >
            {match.scoreB}
          </button>
        )}
      </div>
    </div>
  );
};

export const LiveBracketCanvas: React.FC<LiveBracketCanvasProps> = ({
  matches,
  onSelectMatch,
  onSelectSquad,
  canEdit = false,
  onUpdateMatch,
}) => {
  const [mobileRound, setMobileRound] = useState<BracketRound>('QUARTERFINAL');
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [quickEditMatch, setQuickEditMatch] = useState<Match | null>(null);
  const [editScoreA, setEditScoreA] = useState<number>(0);
  const [editScoreB, setEditScoreB] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<MatchStatus>('UPCOMING');
  const [editMapName, setEditMapName] = useState<string>('');
  const [editMvp, setEditMvp] = useState<string>('');
  const [savingQuickEdit, setSavingQuickEdit] = useState(false);

  const handleQuickPatch = async (matchId: string, patch: Partial<Match>) => {
    if (!onUpdateMatch) return;
    setBusyMatchId(matchId);
    try {
      await onUpdateMatch(matchId, patch);
    } finally {
      setBusyMatchId(null);
    }
  };

  const openQuickEdit = (match: Match) => {
    setQuickEditMatch(match);
    setEditScoreA(match.scoreA);
    setEditScoreB(match.scoreB);
    setEditStatus(match.status);
    setEditMapName(match.mapName || '');
    setEditMvp(match.mvpIgn || '');
  };

  const handleSaveQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditMatch || !onUpdateMatch) return;
    setSavingQuickEdit(true);
    try {
      await onUpdateMatch(quickEditMatch.id, {
        scoreA: Math.max(0, Number(editScoreA) || 0),
        scoreB: Math.max(0, Number(editScoreB) || 0),
        status: editStatus,
        mapName: editMapName.trim().toUpperCase() || quickEditMatch.mapName,
        mvpIgn: editMvp.trim() || undefined,
      });
      setQuickEditMatch(null);
    } finally {
      setSavingQuickEdit(false);
    }
  };

  const qf = matches
    .filter((m) => m.round === 'QUARTERFINAL')
    .sort((a, b) => a.bracketOrder - b.bracketOrder);
  const sf = matches
    .filter((m) => m.round === 'SEMIFINAL')
    .sort((a, b) => a.bracketOrder - b.bracketOrder);
  const gf = matches
    .filter((m) => m.round === 'GRAND FINAL')
    .sort((a, b) => a.bracketOrder - b.bracketOrder);

  if (matches.length === 0) {
    return (
      <div className="border border-white/[0.08] bg-[#12161F] rounded-[6px] p-8 sm:p-10 text-center">
        <p className="font-display text-xl uppercase text-[#F8FAFC]">
          Bagan Belum Dibuat
        </p>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Gunakan fitur Auto-Generate Bracket di menu Tournament Builder untuk membuat bagan pertandingan turnamen ini.
        </p>
      </div>
    );
  }

  const allRoundLists: { id: BracketRound; label: string; list: Match[] }[] = [
    { id: 'QUARTERFINAL', label: 'QF', list: qf },
    { id: 'SEMIFINAL', label: 'SF', list: sf },
    { id: 'GRAND FINAL', label: 'FINAL', list: gf },
  ];
  const mobileRoundLists = allRoundLists.filter((r) => r.list.length > 0);

  const activeMobileGroup =
    mobileRoundLists.find((r) => r.id === mobileRound) || mobileRoundLists[0];

  const hasFullTree = qf.length === 4 && sf.length === 2 && gf.length >= 1;

  // Exact geometry for 4 QF -> 2 SF -> 1 GF SVG paths (node width 258px, gap 72px)
  const qfCenters = [66, 202, 338, 474];
  const sfCenters = [134, 406];
  const gfCenter = 270;

  const qfHasWinner = (idx: number) => Boolean(qf[idx]?.winnerTag);
  const sfHasWinner = (idx: number) => Boolean(sf[idx]?.winnerTag);

  return (
    <div className="space-y-4">
      {canEdit && onUpdateMatch ? (
        <p className="font-telemetry text-xs text-[#CCFF00]">
          Mode Edit Admin Aktif · Ubah status (UPCOMING / LIVE / FINISHED), klik +/- pada skor, atau klik ikon pensil untuk edit map &amp; MVP langsung di bagan.
        </p>
      ) : (
        onSelectSquad && (
          <p className="font-telemetry text-xs text-[#94A3B8]">
            Klik nama tim untuk melihat profil squad · Klik skor atau nama map untuk melihat detail pertandingan.
          </p>
        )
      )}

      {/* Mobile Round-Tab View (< md) */}
      <div className="md:hidden space-y-4">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
          {mobileRoundLists.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setMobileRound(r.id)}
              className={`min-h-[40px] px-2 font-telemetry text-xs font-bold uppercase tracking-[0.06em] rounded-[2px] transition-colors cursor-pointer ${
                activeMobileGroup?.id === r.id
                  ? r.id === 'GRAND FINAL'
                    ? 'bg-[#CCFF00] text-[#0A0C10]'
                    : 'bg-[#00F0FF] text-[#0A0C10]'
                  : 'text-[#94A3B8]'
              }`}
            >
              {r.label} ({r.list.length})
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {activeMobileGroup?.list.map((m) => (
            <MatchNodeCard
              key={m.id}
              match={m}
              onSelect={() => onSelectMatch(m)}
              onSelectSquad={onSelectSquad}
              canEdit={canEdit}
              busy={busyMatchId === m.id}
              onQuickPatch={handleQuickPatch}
              onOpenQuickEdit={openQuickEdit}
              fullWidth
            />
          ))}
        </div>
      </div>

      {/* Tablet & Desktop SVG Tree / Columns View (md+) */}
      <div className="hidden md:block">
        {!hasFullTree ? (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-8 min-w-max">
              {[
                { label: 'QUARTERFINAL', list: qf },
                { label: 'SEMIFINAL', list: sf },
                { label: 'GRAND FINAL', list: gf },
              ]
                .filter((col) => col.list.length > 0)
                .map((col) => (
                  <div key={col.label} className="space-y-4">
                    <div className="font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-[#94A3B8] pb-2 border-b border-white/[0.08]">
                      {col.label}
                    </div>
                    <div className="flex flex-col gap-4">
                      {col.list.map((m) => (
                        <MatchNodeCard
                          key={m.id}
                          match={m}
                          onSelect={() => onSelectMatch(m)}
                          onSelectSquad={onSelectSquad}
                          canEdit={canEdit}
                          busy={busyMatchId === m.id}
                          onQuickPatch={handleQuickPatch}
                          onOpenQuickEdit={openQuickEdit}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="min-w-[930px]">
              {/* Round Headers */}
              <div className="grid grid-cols-[258px_72px_258px_72px_258px] mb-5">
                <div className="font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-[#94A3B8] border-b border-white/[0.08] pb-2">
                  QUARTERFINALS
                </div>
                <div />
                <div className="font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-[#94A3B8] border-b border-white/[0.08] pb-2">
                  SEMIFINALS
                </div>
                <div />
                <div className="font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-[#CCFF00] border-b border-[#CCFF00]/30 pb-2">
                  GRAND FINAL
                </div>
              </div>

              {/* Positioned Canvas with Dynamic SVG Connectors */}
              <div className="relative h-[540px] w-[918px]">
                <svg
                  width="918"
                  height="540"
                  viewBox="0 0 918 540"
                  className="absolute inset-0 pointer-events-none"
                  aria-hidden="true"
                >
                  <path
                    d={`M 258 ${qfCenters[0]} H 294 V ${sfCenters[0]} H 330`}
                    fill="none"
                    stroke={qfHasWinner(0) ? '#00F0FF' : 'rgba(255,255,255,0.12)'}
                    strokeWidth="2"
                  />
                  <path
                    d={`M 258 ${qfCenters[1]} H 294 V ${sfCenters[0]} H 330`}
                    fill="none"
                    stroke={qfHasWinner(1) ? '#00F0FF' : 'rgba(255,255,255,0.12)'}
                    strokeWidth="2"
                  />
                  <path
                    d={`M 258 ${qfCenters[2]} H 294 V ${sfCenters[1]} H 330`}
                    fill="none"
                    stroke={qfHasWinner(2) ? '#00F0FF' : 'rgba(255,255,255,0.12)'}
                    strokeWidth="2"
                  />
                  <path
                    d={`M 258 ${qfCenters[3]} H 294 V ${sfCenters[1]} H 330`}
                    fill="none"
                    stroke={qfHasWinner(3) ? '#00F0FF' : 'rgba(255,255,255,0.12)'}
                    strokeWidth="2"
                  />
                  <path
                    d={`M 588 ${sfCenters[0]} H 624 V ${gfCenter} H 660`}
                    fill="none"
                    stroke={sfHasWinner(0) ? '#00F0FF' : 'rgba(255,255,255,0.12)'}
                    strokeWidth="2"
                  />
                  <path
                    d={`M 588 ${sfCenters[1]} H 624 V ${gfCenter} H 660`}
                    fill="none"
                    stroke={sfHasWinner(1) ? '#00F0FF' : 'rgba(255,255,255,0.12)'}
                    strokeWidth="2"
                  />
                </svg>

                {qf.map((match, i) => (
                  <div
                    key={match.id}
                    className="absolute left-0"
                    style={{ top: qfCenters[i] - 58 }}
                  >
                    <MatchNodeCard
                      match={match}
                      onSelect={() => onSelectMatch(match)}
                      onSelectSquad={onSelectSquad}
                      canEdit={canEdit}
                      busy={busyMatchId === match.id}
                      onQuickPatch={handleQuickPatch}
                      onOpenQuickEdit={openQuickEdit}
                    />
                  </div>
                ))}

                {sf.map((match, i) => (
                  <div
                    key={match.id}
                    className="absolute left-[330px]"
                    style={{ top: sfCenters[i] - 58 }}
                  >
                    <MatchNodeCard
                      match={match}
                      onSelect={() => onSelectMatch(match)}
                      onSelectSquad={onSelectSquad}
                      canEdit={canEdit}
                      busy={busyMatchId === match.id}
                      onQuickPatch={handleQuickPatch}
                      onOpenQuickEdit={openQuickEdit}
                    />
                  </div>
                ))}

                <div className="absolute left-[660px]" style={{ top: gfCenter - 58 }}>
                  <MatchNodeCard
                    match={gf[0]}
                    onSelect={() => onSelectMatch(gf[0])}
                    onSelectSquad={onSelectSquad}
                    canEdit={canEdit}
                    busy={busyMatchId === gf[0].id}
                    onQuickPatch={handleQuickPatch}
                    onOpenQuickEdit={openQuickEdit}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inline Quick Edit Modal for Super Admin */}
      {quickEditMatch && canEdit && onUpdateMatch && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setQuickEditMatch(null)}
        >
          <div
            className="w-full max-w-md bg-[#12161F] border border-white/15 rounded-[6px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#00F0FF]">
                  {quickEditMatch.round} · EDIT LANGSUNG BAGAN
                </div>
                <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC] mt-0.5">
                  {quickEditMatch.teamATag} vs {quickEditMatch.teamBTag}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickEditMatch(null)}
                className="p-1.5 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickEdit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1 truncate">
                    Skor {quickEditMatch.teamA}
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editScoreA}
                    onChange={(e) => setEditScoreA(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm font-bold text-[#F8FAFC] tabular-nums focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1 truncate">
                    Skor {quickEditMatch.teamB}
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editScoreB}
                    onChange={(e) => setEditScoreB(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm font-bold text-[#F8FAFC] tabular-nums focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                    Status Pertandingan
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as MatchStatus)}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs font-bold uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  >
                    <option value="UPCOMING">UPCOMING</option>
                    <option value="LIVE">LIVE</option>
                    <option value="FINISHED">FINISHED (Loloskan Pemenang)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                    Map / Stadion
                  </label>
                  <input
                    type="text"
                    value={editMapName}
                    onChange={(e) => setEditMapName(e.target.value)}
                    placeholder="DOWNTOWN"
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                  MVP IGN (Opsional)
                </label>
                <input
                  type="text"
                  value={editMvp}
                  onChange={(e) => setEditMvp(e.target.value)}
                  placeholder="Contoh: ORD_Kuroi#ID1"
                  className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickEditMatch(null)}
                  className="px-4 py-2 border border-white/20 text-[#F8FAFC] font-display text-xs font-semibold uppercase rounded-[4px] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingQuickEdit}
                  className="px-5 py-2 bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] disabled:opacity-50 cursor-pointer"
                >
                  {savingQuickEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
