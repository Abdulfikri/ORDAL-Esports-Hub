import React, { useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  GitBranch,
  Globe,
  Info,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useMatchNotifications } from '../hooks/useMatchNotifications';
import type { GameTitle, Match, MatchStatus, Squad, Tournament } from '../types';
import { OrdalMonogram } from './BrandAssets';
import { LiveBracketCanvas } from './LiveBracketCanvas';
import { MatchNotificationButton } from './MatchNotificationButton';
import type { SquadProfileTarget } from './SquadProfileModal';

export type TournamentDetailTab = 'overview' | 'bracket' | 'participants' | 'matches' | 'rules';

interface TournamentDetailHubProps {
  tournament: Tournament;
  initialTab?: TournamentDetailTab;
  matches: Match[];
  squads: Squad[];
  activeTeamGame?: GameTitle;
  onClose: () => void;
  onTabChange?: (tab: TournamentDetailTab) => void;
  onRegister: (tournamentId: string) => void;
  onSelectMatch: (match: Match) => void;
  onSelectSquad?: (target: SquadProfileTarget) => void;
  onNotify?: (msg: string) => void;
  canEditBracket?: boolean;
  onUpdateMatch?: (matchId: string, patch: Partial<Match>) => Promise<void>;
}

function parsePrizeAmount(prizeStr: string): number {
  const digits = String(prizeStr || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function formatIdr(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

const RULES_SECTIONS = [
  {
    code: '01',
    title: 'Ketentuan Roster & Registrasi',
    items: [
      'Setiap tim wajib mendaftarkan minimal 5 pemain inti (Core) dan maksimal 1 pemain cadangan (Sub) sebelum pendaftaran ditutup.',
      'IGN (In-Game Name) pemain yang bertanding wajib sama persis dengan roster yang terdaftar di sistem ORDAL.',
      'Pemain hanya diperbolehkan terdaftar pada 1 tim dalam turnamen yang sama (multi-slot dilarang).',
    ],
  },
  {
    code: '02',
    title: 'Prosedur Check-In & Keterlambatan (WO)',
    items: [
      'Kapten tim wajib melakukan konfirmasi Check-In selambat-lambatnya 30 menit sebelum jadwal Kick-Off.',
      'Batas toleransi keterlambatan masuk lobby adalah 10 menit dari jadwal resmi. Tim yang belum lengkap dinyatakan Walkover (WO).',
      'Perubahan pemain cadangan wajib dilaporkan kepada panitia sebelum fase Draft / Map Veto dimulai.',
    ],
  },
  {
    code: '03',
    title: 'Format Pertandingan & Map Veto',
    items: [
      'Babak penyisihan hingga Quarterfinal menggunakan sistem gugur (BO1), sedangkan Semifinal & Grand Final menggunakan BO3.',
      'Penentuan map dan sisi awal (Attack/Defense) dilakukan melalui sistem coin toss / veto oleh kapten kedua tim.',
      'Server pertandingan standar menggunakan server Singapore / Indonesia dengan mode Tournament Standard.',
    ],
  },
  {
    code: '04',
    title: 'Fair Play, Anti-Cheat & Sengketa',
    items: [
      'Penggunaan program ilegal (cheat, macro, script, bug abuse) berakibat diskualifikasi langsung dan banned permanen dari seluruh event ORDAL.',
      'Segala bentuk toxic, SARA, atau pelecehan di chat in-game akan dikenai peringatan keras hingga diskualifikasi.',
      'Kapten tim pemenang wajib menyimpan screenshot hasil akhir pertandingan untuk verifikasi jika terjadi dispute.',
    ],
  },
];

export const TournamentDetailHub: React.FC<TournamentDetailHubProps> = ({
  tournament,
  initialTab = 'overview',
  matches,
  squads,
  activeTeamGame,
  onClose,
  onTabChange,
  onRegister,
  onSelectMatch,
  onSelectSquad,
  onNotify,
  canEditBracket = false,
  onUpdateMatch,
}) => {
  const [activeTab, setActiveTab] = useState<TournamentDetailTab>(initialTab);
  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [tournament.id, initialTab]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [checkInFilter, setCheckInFilter] = useState<'ALL' | 'CHECKED IN' | 'PENDING'>('ALL');
  const [matchStatusFilter, setMatchStatusFilter] = useState<'ALL' | MatchStatus>('ALL');
  const [copiedLink, setCopiedLink] = useState(false);
  const { isNotified, toggleMatchNotification } = useMatchNotifications(onNotify);
  useEscapeKey(true, onClose);

  const tournamentMatches = useMemo(
    () => matches.filter((m) => m.tournamentId === tournament.id),
    [matches, tournament.id]
  );

  const filteredTournamentMatches = useMemo(() => {
    if (matchStatusFilter === 'ALL') return tournamentMatches;
    return tournamentMatches.filter((m) => m.status === matchStatusFilter);
  }, [tournamentMatches, matchStatusFilter]);

  const tournamentSquads = useMemo(
    () =>
      squads
        .filter((s) => s.tournamentId === tournament.id)
        .sort((a, b) => a.seed - b.seed),
    [squads, tournament.id]
  );

  const filteredSquads = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    return tournamentSquads.filter((sq) => {
      const matchStatus =
        checkInFilter === 'ALL' ? true : sq.checkInStatus === checkInFilter;
      const matchQuery =
        !q ||
        sq.name.toLowerCase().includes(q) ||
        sq.tag.toLowerCase().includes(q) ||
        sq.captainIgn.toLowerCase().includes(q) ||
        sq.roster.some((r) => r.toLowerCase().includes(q));
      return matchStatus && matchQuery;
    });
  }, [tournamentSquads, participantSearch, checkInFilter]);

  const checkedInCount = useMemo(
    () => tournamentSquads.filter((s) => s.checkInStatus === 'CHECKED IN').length,
    [tournamentSquads]
  );

  const maxTeams = Math.max(1, tournament.maxTeams);
  const registeredCount = Math.max(tournament.registeredTeams, tournamentSquads.length);
  const slotPercent = Math.min(100, Math.round((registeredCount / maxTeams) * 100));
  const isFull = registeredCount >= maxTeams;

  const organizerName = tournament.organizer || 'ORDAL Esports Hub';
  const registrationFee = tournament.registrationFee || 'GRATIS (FREE)';
  const modeLabel = tournament.mode || '5v5 · Online';
  const checkInInfo = tournament.checkInInfo || '30 Menit Sebelum Kick-Off';
  const customRuleLines = useMemo(
    () =>
      (tournament.rules || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [tournament.rules]
  );

  const prizeNumeric = parsePrizeAmount(tournament.prizePool);
  const prizeBreakdown = useMemo(() => {
    const default1 = prizeNumeric > 0 ? formatIdr(prizeNumeric * 0.5) : tournament.prizePool;
    const default2 = prizeNumeric > 0 ? formatIdr(prizeNumeric * 0.3) : 'Trophy & E-Cert';
    const default3 = prizeNumeric > 0 ? formatIdr(prizeNumeric * 0.15) : 'E-Certificate';
    const defaultMvp = prizeNumeric > 0 ? formatIdr(prizeNumeric * 0.05) : 'MVP Badge';
    return [
      {
        rank: 'Juara 1 (Champion)',
        share: tournament.prizeFirst ? 'Custom' : '50%',
        amount: tournament.prizeFirst || default1,
        accent: '#CCFF00',
      },
      {
        rank: 'Juara 2 (Runner-Up)',
        share: tournament.prizeSecond ? 'Custom' : '30%',
        amount: tournament.prizeSecond || default2,
        accent: '#00F0FF',
      },
      {
        rank: 'Juara 3 (3rd Place)',
        share: tournament.prizeThird ? 'Custom' : '15%',
        amount: tournament.prizeThird || default3,
        accent: '#F8FAFC',
      },
      {
        rank: 'Tournament MVP',
        share: tournament.prizeMvp ? 'Custom' : '5%',
        amount: tournament.prizeMvp || defaultMvp,
        accent: '#FF2E5B',
      },
    ];
  }, [
    prizeNumeric,
    tournament.prizePool,
    tournament.prizeFirst,
    tournament.prizeSecond,
    tournament.prizeThird,
    tournament.prizeMvp,
  ]);

  const handleCopyShareLink = async () => {
    try {
      const params = new URLSearchParams();
      params.set('trn', tournament.id);
      params.set('tab', activeTab);
      const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}#turnamen`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      onNotify?.('Link turnamen berhasil disalin ke clipboard.');
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onNotify?.('Gagal menyalin link. Salin URL langsung dari address bar browser.');
    }
  };

  const TABS: {
    id: TournamentDetailTab;
    label: string;
    count?: number;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'overview', label: 'Overview', Icon: Info },
    { id: 'bracket', label: 'Bracket', count: tournamentMatches.length, Icon: GitBranch },
    { id: 'participants', label: 'Peserta', count: registeredCount, Icon: Users },
    { id: 'matches', label: 'Jadwal & Match', count: tournamentMatches.length, Icon: Swords },
    { id: 'rules', label: 'Peraturan', Icon: FileText },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-[#0A0C10]/88 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-[1340px] max-h-[94dvh] bg-[#12161F] border border-white/15 rounded-[8px] flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
        {/* Top Hero Header (Fastur.gg Style) */}
        <div className="relative px-4 sm:px-7 py-5 border-b border-white/[0.08] bg-gradient-to-r from-[#0A0C10] via-[#101624] to-[#0A0C10] shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em]">
                <span className="px-2 py-0.5 rounded-[3px] bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#00F0FF]">
                  {tournament.game}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-[3px] border ${
                    tournament.status === 'OPEN'
                      ? 'bg-[#CCFF00]/15 border-[#CCFF00]/40 text-[#CCFF00]'
                      : tournament.status === 'ONGOING'
                        ? 'bg-[#FF2E5B]/15 border-[#FF2E5B]/40 text-[#FF2E5B]'
                        : 'bg-white/[0.06] border-white/15 text-[#94A3B8]'
                  }`}
                >
                  {tournament.status === 'OPEN'
                    ? 'PENDAFTARAN DIBUKA'
                    : tournament.status === 'ONGOING'
                      ? 'SEDANG BERLANGSUNG'
                      : 'SELESAI'}
                </span>
                <span className="text-[#94A3B8]">
                  {modeLabel.toUpperCase()} · {tournament.format}
                </span>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-[#F8FAFC] leading-tight">
                {tournament.name}
              </h2>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-telemetry text-xs text-[#94A3B8]">
                <span className="inline-flex items-center gap-1.5 text-[#F8FAFC]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00F0FF]" />
                  {organizerName}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-[#CCFF00]" />
                  <strong className="text-[#CCFF00]">{tournament.prizePool}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#00F0FF]" />
                  {tournament.startDate}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#94A3B8]" />
                  {tournament.region}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#94A3B8]" />
                  {registeredCount} / {maxTeams} Tim
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] border border-white/15 bg-white/[0.04] hover:border-[#00F0FF]/60 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#F8FAFC] cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5 text-[#00F0FF]" />
                {copiedLink ? 'Tersalin!' : 'Bagikan'}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup detail turnamen"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#94A3B8] hover:text-white border border-white/15 rounded-[4px] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Fastur-style Multi-Tab Bar */}
        <div className="px-4 sm:px-7 border-b border-white/[0.08] bg-[#0A0C10]/70 overflow-x-auto no-scrollbar shrink-0">
          <div className="inline-flex items-center gap-1 min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.Icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    onTabChange?.(tab.id);
                  }}
                  className={`relative px-4 py-3.5 inline-flex items-center gap-2 font-telemetry text-xs font-bold uppercase tracking-[0.06em] transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'text-[#00F0FF] border-b-2 border-[#00F0FF]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] border-b-2 border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-[3px] text-[10px] ${
                        isActive
                          ? 'bg-[#00F0FF]/15 text-[#00F0FF]'
                          : 'bg-white/[0.06] text-[#94A3B8]'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 8 Cols: About, Prize Pool Breakdown, Phase Timeline */}
              <div className="lg:col-span-8 space-y-6">
                {/* Tentang Turnamen */}
                <div className="p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                  <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                    Tentang Turnamen
                  </h3>
                  <p className="mt-2 text-sm text-[#CBD5E1] leading-relaxed">
                    {tournament.description}
                  </p>
                  <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-3 font-telemetry text-xs">
                    <div>
                      <div className="text-[10px] uppercase text-[#94A3B8]">Biaya Daftar</div>
                      <div className="mt-0.5 font-bold text-[#CCFF00]">{registrationFee}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#94A3B8]">Mode</div>
                      <div className="mt-0.5 font-bold text-[#F8FAFC]">{modeLabel}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#94A3B8]">Format</div>
                      <div className="mt-0.5 font-bold text-[#F8FAFC]">{tournament.format}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#94A3B8]">Server / Region</div>
                      <div className="mt-0.5 font-bold text-[#F8FAFC]">{tournament.region}</div>
                    </div>
                  </div>
                </div>

                {/* Distribusi Hadiah (Prize Pool Breakdown) */}
                <div className="p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                    <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC] flex items-center gap-2">
                      <Award className="w-5 h-5 text-[#CCFF00]" />
                      Distribusi Hadiah (Prize Pool)
                    </h3>
                    <span className="font-telemetry text-xs font-bold text-[#CCFF00]">
                      Total: {tournament.prizePool}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {prizeBreakdown.map((item) => (
                      <div
                        key={item.rank}
                        className="p-3.5 bg-[#12161F] border border-white/[0.08] rounded-[4px] flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-display text-sm font-bold uppercase text-[#F8FAFC]">
                            {item.rank}
                          </div>
                          <div className="font-telemetry text-[10px] uppercase text-[#94A3B8]">
                            Alokasi {item.share}
                          </div>
                        </div>
                        <div
                          className="font-telemetry text-sm font-bold tabular-nums"
                          style={{ color: item.accent }}
                        >
                          {item.amount}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Jadwal Fase Turnamen (Timeline) */}
                <div className="p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                  <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC] flex items-center gap-2 pb-3 border-b border-white/[0.06]">
                    <Clock className="w-5 h-5 text-[#00F0FF]" />
                    Timeline &amp; Tahapan Turnamen
                  </h3>
                  <div className="mt-4 space-y-3">
                    {[
                      {
                        step: 'FASE 1',
                        title: 'Pendaftaran & Verifikasi Roster',
                        desc: 'Kapten mendaftarkan nama tim, tag, dan 5 pemain inti melalui tombol Daftar Squad.',
                        active: tournament.status === 'OPEN',
                      },
                      {
                        step: 'FASE 2',
                        title: `Check-In Tim (${checkInInfo})`,
                        desc: 'Konfirmasi kehadiran wajib dilakukan sebelum bracket dikunci oleh panitia.',
                        active: tournament.status === 'OPEN',
                      },
                      {
                        step: 'FASE 3',
                        title: `Kick-Off & Babak Gugur (${tournament.startDate})`,
                        desc: 'Pertandingan dimulai serentak sesuai bagan pada tab Bracket & Jadwal Match.',
                        active: tournament.status === 'ONGOING',
                      },
                      {
                        step: 'FASE 4',
                        title: 'Grand Final & Distribusi Prize Pool',
                        desc: 'Penentuan juara dan pencairan hadiah maksimal H+3 setelah turnamen selesai.',
                        active: tournament.status === 'COMPLETED',
                      },
                    ].map((phase) => (
                      <div
                        key={phase.step}
                        className={`p-3.5 rounded-[4px] border flex items-start gap-3 ${
                          phase.active
                            ? 'bg-[#00F0FF]/[0.06] border-[#00F0FF]/40'
                            : 'bg-[#12161F]/60 border-white/[0.06]'
                        }`}
                      >
                        <span
                          className={`px-2 py-0.5 rounded-[3px] font-telemetry text-[10px] font-bold uppercase shrink-0 mt-0.5 ${
                            phase.active
                              ? 'bg-[#00F0FF] text-[#0A0C10]'
                              : 'bg-white/[0.08] text-[#94A3B8]'
                          }`}
                        >
                          {phase.step}
                        </span>
                        <div>
                          <div className="font-display text-sm font-bold uppercase text-[#F8FAFC]">
                            {phase.title}
                          </div>
                          <p className="text-xs text-[#94A3B8] mt-0.5">{phase.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right 4 Cols: Fastur-style Registration & Slot Status Sticky Card */}
              <div className="lg:col-span-4 space-y-4">
                <div className="p-5 bg-[#0A0C10] border border-[#00F0FF]/35 rounded-[6px] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                      Status Slot Tim
                    </span>
                    <span className="font-telemetry text-xs font-bold text-[#CCFF00] tabular-nums">
                      {registeredCount} / {maxTeams} TIM
                    </span>
                  </div>

                  <div className="h-2 w-full bg-[#12161F] rounded-[3px] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#00F0FF] to-[#CCFF00]"
                      style={{ width: `${slotPercent}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 font-telemetry text-xs">
                    <div className="p-2.5 bg-[#12161F] rounded-[4px] border border-white/[0.06]">
                      <div className="text-[10px] text-[#94A3B8]">Checked In</div>
                      <div className="mt-0.5 font-bold text-[#CCFF00]">{checkedInCount} Tim</div>
                    </div>
                    <div className="p-2.5 bg-[#12161F] rounded-[4px] border border-white/[0.06]">
                      <div className="text-[10px] text-[#94A3B8]">Sisa Slot</div>
                      <div className="mt-0.5 font-bold text-[#F8FAFC]">
                        {Math.max(0, maxTeams - registeredCount)} Slot
                      </div>
                    </div>
                  </div>

                  {activeTeamGame && activeTeamGame !== tournament.game ? (
                    <div className="p-3 bg-[#FF2E5B]/10 border border-[#FF2E5B]/35 rounded-[4px] font-telemetry text-[11px] text-[#FFDADB]">
                      Akun tim Anda terdaftar di cabang <strong>{activeTeamGame}</strong>, sehingga tidak dapat mendaftar di turnamen <strong>{tournament.game}</strong>.
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={tournament.status === 'COMPLETED' || isFull}
                      onClick={() => onRegister(tournament.id)}
                      className="w-full min-h-[46px] bg-[#CCFF00] text-[#0A0C10] font-display text-base font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                      {tournament.status === 'COMPLETED'
                        ? 'Turnamen Selesai'
                        : isFull
                          ? 'Slot Penuh'
                          : 'Daftar Squad Sekarang'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveTab('bracket')}
                    className="w-full min-h-[42px] border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] hover:bg-[#00F0FF]/[0.06] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <GitBranch className="w-4 h-4 text-[#00F0FF]" />
                    Buka Live Bracket
                  </button>
                </div>

                {/* Organizer Card */}
                <div className="p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-3">
                  <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">
                    Penyelenggara Resmi
                  </div>
                  <div className="flex items-center gap-3">
                    <OrdalMonogram size={40} />
                    <div>
                      <div className="font-display text-base font-bold uppercase text-[#F8FAFC] flex items-center gap-1.5">
                        {organizerName}
                        <CheckCircle2 className="w-4 h-4 text-[#00F0FF]" />
                      </div>
                      <div className="font-telemetry text-[11px] text-[#94A3B8]">
                        Verified Tournament Organizer · {tournament.region}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    Didukung sistem seeding bracket otomatis, pembaruan skor real-time, serta moderasi wasit resmi ORDAL.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE BRACKET */}
          {activeTab === 'bracket' && (
            <LiveBracketCanvas
              matches={tournamentMatches}
              onSelectMatch={onSelectMatch}
              onSelectSquad={
                onSelectSquad
                  ? (teamName, teamTag) =>
                      onSelectSquad({ teamName, teamTag, tournamentId: tournament.id })
                  : undefined
              }
              canEdit={canEditBracket}
              onUpdateMatch={onUpdateMatch}
            />
          )}

          {/* TAB 3: PARTICIPANTS / TIM TERDAFTAR */}
          {activeTab === 'participants' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder="Cari nama tim, tag, atau IGN pemain..."
                    className="w-full pl-9 pr-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] p-1 self-start sm:self-auto">
                  {(['ALL', 'CHECKED IN', 'PENDING'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setCheckInFilter(st)}
                      className={`px-3 py-1.5 rounded-[3px] font-telemetry text-[11px] font-bold uppercase cursor-pointer ${
                        checkInFilter === st
                          ? 'bg-[#00F0FF] text-[#0A0C10]'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {st === 'ALL' ? `Semua (${tournamentSquads.length})` : st}
                    </button>
                  ))}
                </div>
              </div>

              {filteredSquads.length === 0 ? (
                <div className="p-10 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] text-center">
                  <p className="font-display text-lg uppercase text-[#F8FAFC]">
                    Belum Ada Tim Terdaftar yang Cocok
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Jadilah tim pertama yang mengamankan slot turnamen ini!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSquads.map((sq) => (
                    <div
                      key={sq.id}
                      onClick={() =>
                        onSelectSquad?.({
                          teamName: sq.name,
                          teamTag: sq.tag,
                          tournamentId: sq.tournamentId,
                        })
                      }
                      role={onSelectSquad ? 'button' : undefined}
                      tabIndex={onSelectSquad ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (onSelectSquad && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onSelectSquad({
                            teamName: sq.name,
                            teamTag: sq.tag,
                            tournamentId: sq.tournamentId,
                          });
                        }
                      }}
                      className={`p-4 bg-[#0A0C10] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[6px] space-y-3 transition-colors ${
                        onSelectSquad ? 'cursor-pointer' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-[4px] bg-[#12161F] border border-[#00F0FF]/35 flex items-center justify-center font-telemetry text-xs font-bold text-[#00F0FF] shrink-0">
                            #{sq.seed}
                          </div>
                          <div className="min-w-0">
                            <div className="font-display text-base font-bold uppercase text-[#F8FAFC] hover:text-[#00F0FF] truncate transition-colors">
                              {sq.name}
                            </div>
                            <div className="font-telemetry text-[11px] text-[#94A3B8]">
                              [{sq.tag}] · Kapten: {sq.captainIgn}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-[3px] font-telemetry text-[10px] font-bold uppercase shrink-0 ${
                            sq.checkInStatus === 'CHECKED IN'
                              ? 'bg-[#CCFF00]/15 text-[#CCFF00] border border-[#CCFF00]/35'
                              : sq.checkInStatus === 'DISQUALIFIED'
                                ? 'bg-[#FF2E5B]/15 text-[#FF2E5B] border border-[#FF2E5B]/35'
                                : 'bg-white/[0.06] text-[#94A3B8] border border-white/10'
                          }`}
                        >
                          {sq.checkInStatus}
                        </span>
                      </div>

                      <div className="pt-2.5 border-t border-white/[0.06]">
                        <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                          Lineup Roster ({sq.roster.length} Pemain)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {sq.roster.map((player) => (
                            <span
                              key={player}
                              className="px-2 py-0.5 bg-[#12161F] border border-white/[0.08] rounded-[3px] font-telemetry text-[11px] text-[#CBD5E1]"
                            >
                              {player}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MATCHES & SCHEDULE */}
          {activeTab === 'matches' && (
            <div className="space-y-4">
              {tournamentMatches.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-1.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] p-1">
                    {(
                      [
                        { id: 'ALL', label: 'Semua', count: tournamentMatches.length },
                        {
                          id: 'UPCOMING',
                          label: 'Upcoming',
                          count: tournamentMatches.filter((m) => m.status === 'UPCOMING').length,
                        },
                        {
                          id: 'LIVE',
                          label: 'Live',
                          count: tournamentMatches.filter((m) => m.status === 'LIVE').length,
                        },
                        {
                          id: 'FINISHED',
                          label: 'Finished',
                          count: tournamentMatches.filter((m) => m.status === 'FINISHED').length,
                        },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setMatchStatusFilter(st.id)}
                        className={`px-3 py-1.5 rounded-[3px] font-telemetry text-[11px] font-bold uppercase cursor-pointer whitespace-nowrap tabular-nums ${
                          matchStatusFilter === st.id
                            ? 'bg-[#00F0FF] text-[#0A0C10]'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {st.label} ({st.count})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tournamentMatches.length === 0 ? (
                <div className="p-10 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] text-center">
                  <p className="font-display text-lg uppercase text-[#F8FAFC]">
                    Jadwal Match Belum Digenerate
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Match akan tampil otomatis setelah panitia membuat bracket turnamen.
                  </p>
                </div>
              ) : filteredTournamentMatches.length === 0 ? (
                <div className="p-10 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] text-center">
                  <p className="font-display text-lg uppercase text-[#F8FAFC]">
                    Tidak Ada Match Berstatus {matchStatusFilter}
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Pilih filter status lain untuk melihat jadwal atau hasil pertandingan turnamen ini.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTournamentMatches.map((m) => (
                    <div
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectMatch(m)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectMatch(m);
                        }
                      }}
                      className="text-left p-4 bg-[#0A0C10] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[6px] transition-colors cursor-pointer space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 font-telemetry text-[10px] font-bold uppercase tracking-[0.08em]">
                        <span className="text-[#94A3B8]">
                          {m.round} · MAP {m.mapName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              m.status === 'LIVE'
                                ? 'text-[#FF2E5B]'
                                : m.status === 'FINISHED'
                                  ? 'text-[#CCFF00]'
                                  : 'text-[#00F0FF]'
                            }
                          >
                            {m.status === 'LIVE' ? '● LIVE' : m.status}
                          </span>
                          {m.status === 'UPCOMING' && (
                            <MatchNotificationButton
                              compact
                              active={isNotified(m.id)}
                              matchLabel={`${m.teamATag} vs ${m.teamBTag}`}
                              onToggle={() => toggleMatchNotification(m)}
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="min-w-0">
                          <div className="font-display text-base font-bold uppercase text-[#F8FAFC] truncate">
                            {m.teamA}
                          </div>
                          <div className="font-telemetry text-[10px] text-[#94A3B8]">[{m.teamATag}]</div>
                        </div>

                        <div className="px-3 py-1.5 bg-[#12161F] border border-white/10 rounded-[4px] font-telemetry text-base font-bold tabular-nums text-[#00F0FF]">
                          {m.scoreA} : {m.scoreB}
                        </div>

                        <div className="min-w-0 text-right">
                          <div className="font-display text-base font-bold uppercase text-[#F8FAFC] truncate">
                            {m.teamB}
                          </div>
                          <div className="font-telemetry text-[10px] text-[#94A3B8]">[{m.teamBTag}]</div>
                        </div>
                      </div>

                      {m.mvpIgn && (
                        <div className="pt-2 border-t border-white/[0.06] font-telemetry text-[11px] text-[#CCFF00]">
                          MVP Match: {m.mvpIgn}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: RULES / PERATURAN */}
          {activeTab === 'rules' && (
            <div className="space-y-4">
              {customRuleLines.length > 0 && (
                <div className="p-5 bg-[#00F0FF]/[0.06] border border-[#00F0FF]/40 rounded-[6px] space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded-[3px] bg-[#00F0FF] font-telemetry text-xs font-bold text-[#0A0C10]">
                      KHUSUS
                    </span>
                    <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                      Peraturan Khusus Turnamen ({organizerName})
                    </h3>
                  </div>
                  <ul className="space-y-2 text-sm text-[#F8FAFC] list-disc pl-5 leading-relaxed">
                    {customRuleLines.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {RULES_SECTIONS.map((sec) => (
                  <div
                    key={sec.code}
                    className="p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded-[3px] bg-[#00F0FF]/15 border border-[#00F0FF]/40 font-telemetry text-xs font-bold text-[#00F0FF]">
                        PASAL {sec.code}
                      </span>
                      <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                        {sec.title}
                      </h3>
                    </div>
                    <ul className="space-y-2 text-sm text-[#CBD5E1] list-disc pl-5 leading-relaxed">
                      {sec.items.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
