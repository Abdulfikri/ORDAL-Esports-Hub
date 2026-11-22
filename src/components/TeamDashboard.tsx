import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  ExternalLink,
  GitBranch,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Save,
  Swords,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { AuthUser, Match, OrdalDatabase, ScrimGame, ScrimSession, Tournament } from '../types';
import { OrdalMonogram } from './BrandAssets';
import { MatchDetailModal, RegisterSquadModal } from './Modals';
import { PaymentDetailCenter } from './PaymentDetailCenter';
import { formatRupiah, SCRIM_GAMES, ScrimArena } from './ScrimArena';
import { SquadProfileModal, type SquadProfileTarget } from './SquadProfileModal';
import { TournamentDetailHub, type TournamentDetailTab } from './TournamentDetailHub';

type TeamTab = 'profile' | 'scrims' | 'tournaments' | 'payments';

interface TeamDashboardProps {
  user: AuthUser;
  db: OrdalDatabase;
  onUserUpdated: (user: AuthUser) => void;
  onRefresh: () => Promise<void>;
  onCreateSquad: (payload: {
    name: string;
    tag: string;
    tournamentId: string;
    captainIgn: string;
    captainContact: string;
    roster: string[];
    captchaToken?: string;
  }) => Promise<void>;
  onBackToSite: (sectionId?: 'turnamen' | 'scrim') => void;
  onLogout: () => void;
  onNotify: (msg: string) => void;
}

function getTeamScrimStatusMeta(sc: ScrimSession, teamNameUpper: string) {
  const isHost = sc.hostTeamName.trim().toUpperCase() === teamNameUpper;
  const pendingApplicants = (sc.challengerApplications || []).filter(
    (a) => a.status === 'PENDING'
  ).length;

  if (sc.status === 'OPEN_LOBBY') {
    return {
      label: pendingApplicants > 0 ? `${pendingApplicants} Pelamar Masuk` : 'Mencari Lawan',
      hint:
        isHost && pendingApplicants > 0
          ? 'Ada tim yang mengajukan tanding. Buka Scrim Arena untuk memilih lawan.'
          : 'Slot masih terbuka di Scrim Arena.',
      color: 'text-[#CCFF00] border-[#CCFF00]/40',
      needsAction: isHost && pendingApplicants > 0,
    };
  }
  if (sc.status === 'WAITING_APPROVAL') {
    return {
      label: 'Menunggu Konfirmasi Caster',
      hint: 'Menunggu Shoutcaster menyetujui jadwal tanding.',
      color: 'text-[#FF2E5B] border-[#FF2E5B]/40',
      needsAction: false,
    };
  }
  if (sc.status === 'AWAITING_PAYMENT') {
    return {
      label: 'Menunggu Pembayaran Patungan',
      hint: 'Segera lunasi patungan di Scrim Arena sebelum batas waktu berakhir.',
      color: 'text-[#FACC15] border-[#FACC15]/40',
      needsAction: true,
    };
  }
  if (sc.status === 'PARTIALLY_PAID') {
    const mySidePaid = isHost ? sc.hostPaid : sc.challengerPaid;
    return {
      label: mySidePaid ? 'Menunggu Lawan Bayar' : 'Segera Bayar Bagian Tim Anda',
      hint: mySidePaid
        ? 'Pembayaran tim Anda lunas. Menunggu tim lawan menyelesaikan patungan.'
        : 'Tim lawan sudah membayar! Lunasi bagian Anda di Scrim Arena untuk mengunci jadwal.',
      color: 'text-[#38BDF8] border-[#38BDF8]/40',
      needsAction: !mySidePaid,
    };
  }
  if (sc.status === 'CONFIRMED') {
    return {
      label: 'Terkonfirmasi & Jadwal Terkunci',
      hint: sc.resultRecorded
        ? 'Pertandingan selesai dan skor sudah tercatat.'
        : 'Kedua tim sudah lunas. Siapkan roster sesuai jam main.',
      color: 'text-[#00F0FF] border-[#00F0FF]/40',
      needsAction: false,
    };
  }
  return {
    label: 'Dibatalkan',
    hint: 'Jika sudah membayar, ajukan pengembalian dana (refund) di Scrim Arena.',
    color: 'text-[#94A3B8] border-white/15',
    needsAction: (isHost && sc.hostPaid) || (!isHost && sc.challengerPaid),
  };
}

export const TeamDashboard: React.FC<TeamDashboardProps> = ({
  user,
  db,
  onUserUpdated,
  onRefresh,
  onCreateSquad,
  onBackToSite,
  onLogout,
  onNotify,
}) => {
  const profile = user.teamProfile;
  const [activeTab, setActiveTab] = useState<TeamTab>('profile');
  const [scrimSubView, setScrimSubView] = useState<'history' | 'arena'>('history');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerTournamentId, setRegisterTournamentId] = useState<string | undefined>(undefined);
  const [activeTournamentHub, setActiveTournamentHub] = useState<{
    tournament: Tournament;
    initialTab: TournamentDetailTab;
  } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedSquad, setSelectedSquad] = useState<SquadProfileTarget | null>(null);
  const onboardingStorageKey = `ordal_team_onboarding_dismissed_${user.id}`;
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(onboardingStorageKey) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      setOnboardingDismissed(window.localStorage.getItem(onboardingStorageKey) === 'true');
    } catch {
      setOnboardingDismissed(false);
    }
  }, [onboardingStorageKey]);

  const [teamName, setTeamName] = useState(profile?.teamName || user.displayName);
  const [teamTag, setTeamTag] = useState(profile?.teamTag || 'TEAM');
  const [teamLogo, setTeamLogo] = useState(profile?.teamLogo || '');
  const [primaryGame, setPrimaryGame] = useState<ScrimGame>(
    profile?.primaryGame || 'POINT BLANK'
  );
  const [captainIgn, setCaptainIgn] = useState(profile?.captainIgn || '');
  const [captainContact, setCaptainContact] = useState(profile?.captainContact || '');
  const [rosterCore, setRosterCore] = useState<string[]>(profile?.rosterCore || []);
  const [rosterSub, setRosterSub] = useState<string[]>(profile?.rosterSub || []);
  const [newCorePlayer, setNewCorePlayer] = useState('');
  const [newSubPlayer, setNewSubPlayer] = useState('');
  const [saving, setSaving] = useState(false);

  const normalizedName = (profile?.teamName || teamName).trim().toUpperCase();

  const myScrims = useMemo(
    () =>
      (db.scrims || []).filter(
        (s) =>
          s.hostTeamName.toUpperCase() === normalizedName ||
          s.challengerTeamName.toUpperCase() === normalizedName
      ),
    [db.scrims, normalizedName]
  );

  const mySquads = useMemo(
    () =>
      (db.squads || []).filter(
        (sq) =>
          sq.name.toUpperCase() === normalizedName ||
          sq.tag.toUpperCase() === (profile?.teamTag || teamTag).toUpperCase()
      ),
    [db.squads, normalizedName, profile?.teamTag, teamTag]
  );

  const myPayments = useMemo(() => db.payments || [], [db.payments]);
  const unpaidPaymentsCount = useMemo(
    () => myPayments.filter((p) => p.status === 'UNPAID' || p.status === 'REJECTED').length,
    [myPayments]
  );

  const effectiveTeamGame = profile?.primaryGame || primaryGame;
  const divisionTournaments = useMemo(
    () => (db.tournaments || []).filter((t) => t.game === effectiveTeamGame),
    [db.tournaments, effectiveTeamGame]
  );

  const openTeamRegister = (tournamentId?: string) => {
    if (tournamentId) {
      const target = db.tournaments.find((t) => t.id === tournamentId);
      if (target && target.game !== effectiveTeamGame) {
        onNotify(
          `Tim Anda terdaftar di cabang ${effectiveTeamGame}. Hanya tim ${target.game} yang dapat mendaftar turnamen ini.`
        );
        return;
      }
      setRegisterTournamentId(tournamentId);
      setRegisterModalOpen(true);
      return;
    }
    const matchingOpen = divisionTournaments.find(
      (t) => t.status === 'OPEN' && t.registeredTeams < t.maxTeams
    );
    setRegisterTournamentId(matchingOpen?.id || divisionTournaments[0]?.id);
    setRegisterModalOpen(true);
  };

  const onboardingSteps = useMemo(
    () => [
      {
        id: 'identity',
        title: 'Lengkapi Logo & Kontak Kapten',
        done: Boolean(teamLogo && captainIgn.trim() && captainContact.trim()),
        cta: 'Lengkapi Profil',
        action: () => setActiveTab('profile'),
      },
      {
        id: 'roster',
        title: 'Daftarkan Minimal 5 Roster Inti',
        done: rosterCore.length >= 5,
        cta: `Tambah (${rosterCore.length}/5)`,
        action: () => setActiveTab('profile'),
      },
      {
        id: 'tournament',
        title: 'Ikuti Turnamen Resmi Pertama',
        done: mySquads.length >= 1,
        cta: 'Daftar Turnamen',
        action: () => {
          setActiveTab('tournaments');
          openTeamRegister();
        },
      },
      {
        id: 'scrim',
        title: 'Jadwalkan Sesi Scrim Perdana',
        done: myScrims.length >= 1,
        cta: 'Buka Scrim Arena',
        action: () => {
          setActiveTab('scrims');
          setScrimSubView('arena');
        },
      },
    ],
    [teamLogo, captainIgn, captainContact, rosterCore.length, mySquads.length, myScrims.length]
  );
  const onboardingDoneCount = onboardingSteps.filter((s) => s.done).length;
  const onboardingPercent = Math.round((onboardingDoneCount / onboardingSteps.length) * 100);

  const toggleOnboardingDismissed = (dismissed: boolean) => {
    setOnboardingDismissed(dismissed);
    try {
      if (dismissed) {
        window.localStorage.setItem(onboardingStorageKey, 'true');
      } else {
        window.localStorage.removeItem(onboardingStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleUploadLogo = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setTeamLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAddCore = () => {
    const val = newCorePlayer.trim();
    if (!val) return;
    setRosterCore((prev) => [...prev, val]);
    setNewCorePlayer('');
  };

  const handleAddSub = () => {
    const val = newSubPlayer.trim();
    if (!val) return;
    setRosterSub((prev) => [...prev, val]);
    setNewSubPlayer('');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateTeamProfile({
        teamName: teamName.trim().toUpperCase(),
        teamTag: teamTag.trim().toUpperCase().slice(0, 5),
        teamLogo,
        primaryGame,
        captainIgn: captainIgn.trim(),
        captainContact: captainContact.trim(),
        rosterCore,
        rosterSub,
      });
      onUserUpdated(res.user);
      onNotify('Profil tim & roster diperbarui. Otomatis terisi saat daftar Scrim & Turnamen.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan profil tim.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#F8FAFC] flex">
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[264px] shrink-0 bg-[#12161F] border-r border-white/[0.08] flex flex-col justify-between overflow-y-auto transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => onBackToSite()}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <OrdalMonogram size={32} />
              <div className="text-left">
                <div className="font-display text-base font-bold uppercase tracking-[0.06em] text-[#F8FAFC] leading-none">
                  TEAM PORTAL
                </div>
                <div className="font-telemetry text-[10px] uppercase tracking-[0.1em] text-[#00F0FF] mt-0.5">
                  ROSTER &amp; SCRIM HUB
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-[#94A3B8] hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Team Identity */}
          <div className="p-4 border-b border-white/[0.08] flex items-center gap-3">
            {teamLogo ? (
              <img
                src={teamLogo}
                alt={teamName}
                className="w-10 h-10 rounded-full object-cover border border-[#00F0FF]/40 bg-[#0A0C10] shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#0A0C10] border border-[#00F0FF]/40 flex items-center justify-center font-telemetry text-xs font-bold text-[#00F0FF] shrink-0">
                {teamTag.slice(0, 3) || 'TM'}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-display text-sm font-bold uppercase text-[#F8FAFC] truncate">
                {teamName}
              </div>
              <div className="font-telemetry text-[10px] uppercase text-[#94A3B8] truncate">
                [{teamTag}] · {user.email}
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {[
              { id: 'profile' as TeamTab, label: 'Profil & Roster Tim', icon: Users, badge: 0 },
              { id: 'scrims' as TeamTab, label: 'Riwayat Scrim Tim', icon: Swords, badge: 0 },
              { id: 'payments' as TeamTab, label: 'Invoice & Payment', icon: Receipt, badge: unpaidPaymentsCount },
              { id: 'tournaments' as TeamTab, label: 'Turnamen Diikuti', icon: Trophy, badge: 0 },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-[4px] font-telemetry text-xs font-semibold uppercase tracking-[0.06em] transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#00F0FF]/12 text-[#00F0FF] border border-[#00F0FF]/35'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="font-telemetry text-[11px] font-bold text-[#FF2E5B] tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/[0.08] space-y-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('scrims');
              setScrimSubView('arena');
              setSidebarOpen(false);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] cursor-pointer"
          >
            <Swords className="w-4 h-4" />
            Buka Scrim Arena
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('tournaments');
              setSidebarOpen(false);
              openTeamRegister();
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/20 text-[#F8FAFC] hover:border-[#00F0FF] hover:text-[#00F0FF] font-display text-xs font-bold uppercase tracking-[0.05em] rounded-[4px] transition-colors cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 text-[#CCFF00]" />
            Daftar Turnamen
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/15 text-[#94A3B8] hover:text-[#FF2E5B] hover:border-[#FF2E5B]/50 font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar Akun
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 glass-shield border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu team"
              className="lg:hidden p-2 border border-white/15 rounded-[4px] text-[#F8FAFC] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 font-telemetry text-xs uppercase tracking-[0.08em] truncate">
              <span className="text-[#94A3B8]">Team Portal</span>
              <span className="text-white/25">/</span>
              <span className="text-[#F8FAFC] font-bold truncate">{teamName}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onBackToSite()}
            className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] text-[#00F0FF] hover:underline whitespace-nowrap cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Website Publik
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1280px] w-full mx-auto space-y-8">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Roster Inti
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-[#00F0FF] tabular-nums">
                {rosterCore.length} Pemain
              </div>
            </div>
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Roster Cadangan
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-[#F8FAFC] tabular-nums">
                {rosterSub.length} Pemain
              </div>
            </div>
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Total Sesi Scrim
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-[#CCFF00] tabular-nums">
                {myScrims.length} Match
              </div>
            </div>
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Turnamen Diikuti
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-[#FF2E5B] tabular-nums">
                {mySquads.length} Event
              </div>
            </div>
          </div>

          {/* New-Team Onboarding Checklist */}
          {onboardingDismissed ? (
            onboardingDoneCount < onboardingSteps.length && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleOnboardingDismissed(false)}
                  className="font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] text-[#00F0FF] hover:underline cursor-pointer tabular-nums"
                >
                  Tampilkan Checklist Kesiapan Tim ({onboardingDoneCount}/{onboardingSteps.length}) →
                </button>
              </div>
            )
          ) : (
            <section
              aria-label="Checklist Kesiapan Tim"
              className="p-5 sm:p-6 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                    {onboardingDoneCount === onboardingSteps.length
                      ? 'TIM SIAP BERTANDING · 100% LENGKAP'
                      : 'ONBOARDING TIM BARU'}
                  </div>
                  <h2 className="mt-0.5 font-display text-lg sm:text-xl font-bold uppercase text-[#F8FAFC]">
                    Checklist Kesiapan Tim ({onboardingDoneCount}/{onboardingSteps.length} Selesai)
                  </h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-28 sm:w-36 h-2 bg-[#0A0C10] rounded-[2px] overflow-hidden border border-white/[0.06]">
                    <div
                      className="h-full bg-[#CCFF00] transition-all duration-300"
                      style={{ width: `${onboardingPercent}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleOnboardingDismissed(true)}
                    className="font-telemetry text-[11px] font-semibold uppercase text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer whitespace-nowrap"
                  >
                    Sembunyikan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {onboardingSteps.map((step) => (
                  <div
                    key={step.id}
                    className={`p-3.5 rounded-[4px] border flex flex-col justify-between gap-3 ${
                      step.done
                        ? 'bg-[#0A0C10]/60 border-[#CCFF00]/30'
                        : 'bg-[#0A0C10] border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-[#CCFF00] shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-[#94A3B8] shrink-0 mt-0.5" />
                      )}
                      <span
                        className={`text-xs font-semibold leading-snug ${
                          step.done ? 'text-[#94A3B8] line-through' : 'text-[#F8FAFC]'
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                    {step.done ? (
                      <span className="font-telemetry text-[10px] font-bold uppercase tracking-[0.06em] text-[#CCFF00]">
                        Selesai
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={step.action}
                        className="w-full min-h-[34px] px-3 py-1.5 bg-[#00F0FF]/12 border border-[#00F0FF]/40 hover:bg-[#00F0FF] text-[#00F0FF] hover:text-[#0A0C10] font-telemetry text-[11px] font-bold uppercase rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {step.cta} →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TAB 1: PROFIL & ROSTER */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 space-y-4">
                <div className="pb-3 border-b border-white/[0.08]">
                  <h1 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                    Identitas Tim
                  </h1>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Data ini otomatis mengisi form booking Scrim All Game dan pendaftaran Turnamen.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1.5">
                      Nama Tim
                    </label>
                    <input
                      type="text"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1.5">
                      Tag Tim
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      value={teamTag}
                      onChange={(e) => setTeamTag(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1.5">
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
                    <p className="mt-1 font-telemetry text-[10px] text-[#94A3B8]">
                      Menentukan turnamen &amp; scrim yang bisa diikuti tim ini.
                    </p>
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1.5">
                      Logo Tim
                    </label>
                    <label className="w-full min-h-[42px] px-3 py-2 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] rounded-[4px] flex items-center justify-center gap-1.5 font-telemetry text-xs text-[#F8FAFC] cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-[#00F0FF]" />
                      <span>{teamLogo ? 'Ganti Logo' : 'Upload Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadLogo(e.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1.5">
                      IGN Kapten
                    </label>
                    <input
                      type="text"
                      required
                      value={captainIgn}
                      onChange={(e) => setCaptainIgn(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1.5">
                      Kontak Kapten
                    </label>
                    <input
                      type="text"
                      value={captainContact}
                      onChange={(e) => setCaptainContact(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 min-h-[44px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Menyimpan...' : 'Simpan Profil & Roster'}
                </button>
              </div>

              {/* Roster Manager */}
              <div className="lg:col-span-6 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 space-y-5">
                <div className="pb-3 border-b border-white/[0.08]">
                  <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                    Manajemen Roster Inti &amp; Cadangan
                  </h2>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Tambahkan In-Game Nickname &amp; ID pemain agar tidak perlu ketik ulang saat pendaftaran.
                  </p>
                </div>

                {/* Core Roster */}
                <div className="space-y-2.5">
                  <label className="block font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                    Roster Inti ({rosterCore.length})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCorePlayer}
                      onChange={(e) => setNewCorePlayer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCore();
                        }
                      }}
                      placeholder="Contoh: ORD_Vyn#03"
                      className="flex-1 px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCore}
                      className="inline-flex items-center gap-1 px-3.5 py-2 bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#00F0FF] font-telemetry text-xs font-bold uppercase rounded-[4px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {rosterCore.map((p, idx) => (
                      <div
                        key={`core-${idx}`}
                        className="flex items-center justify-between px-3.5 py-2 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] font-telemetry text-xs"
                      >
                        <span className="text-[#F8FAFC]">
                          <span className="text-[#00F0FF] mr-2">#{idx + 1}</span>
                          {p}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRosterCore((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sub Roster */}
                <div className="space-y-2.5 pt-3 border-t border-white/[0.08]">
                  <label className="block font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
                    Roster Cadangan ({rosterSub.length})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSubPlayer}
                      onChange={(e) => setNewSubPlayer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSub();
                        }
                      }}
                      placeholder="Contoh: ORD_Seno#06"
                      className="flex-1 px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                    <button
                      type="button"
                      onClick={handleAddSub}
                      className="inline-flex items-center gap-1 px-3.5 py-2 bg-[#CCFF00]/15 border border-[#CCFF00]/40 text-[#CCFF00] font-telemetry text-xs font-bold uppercase rounded-[4px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {rosterSub.map((p, idx) => (
                      <div
                        key={`sub-${idx}`}
                        className="flex items-center justify-between px-3.5 py-2 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] font-telemetry text-xs"
                      >
                        <span className="text-[#E2E2E8]">
                          <span className="text-[#CCFF00] mr-2">SUB</span>
                          {p}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRosterSub((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* TAB 2: RIWAYAT & ARENA SCRIM */}
          {activeTab === 'scrims' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                <div>
                  <h1 className="font-display text-2xl font-bold uppercase text-[#F8FAFC]">
                    {scrimSubView === 'history'
                      ? `Jadwal & Riwayat Scrim ${teamName}`
                      : 'Scrim Arena & Booking Langsung'}
                  </h1>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Kelola riwayat match scrim tim Anda atau langsung ajukan dan booking jadwal baru tanpa keluar portal.
                  </p>
                </div>

                <div
                  role="tablist"
                  aria-label="Sub-navigasi Scrim Tim"
                  className="inline-flex items-center gap-1 p-1 bg-[#12161F] border border-white/[0.08] rounded-[4px]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scrimSubView === 'history'}
                    onClick={() => setScrimSubView('history')}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-[3px] font-telemetry text-xs font-bold uppercase tracking-[0.05em] whitespace-nowrap cursor-pointer tabular-nums transition-colors ${
                      scrimSubView === 'history'
                        ? 'bg-[#00F0FF] text-[#0A0C10]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Riwayat Tim ({myScrims.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scrimSubView === 'arena'}
                    onClick={() => setScrimSubView('arena')}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-[3px] font-telemetry text-xs font-bold uppercase tracking-[0.05em] whitespace-nowrap cursor-pointer transition-colors ${
                      scrimSubView === 'arena'
                        ? 'bg-[#00F0FF] text-[#0A0C10]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Arena &amp; Booking Scrim
                  </button>
                </div>
              </div>

              {scrimSubView === 'arena' ? (
                <ScrimArena
                  embedded
                  scrims={db.scrims || []}
                  casters={db.casters || []}
                  payments={db.payments || []}
                  scrimSettings={db.scrimSettings}
                  currentUser={user}
                  teamProfile={profile}
                  onRefresh={onRefresh}
                  onNotify={onNotify}
                />
              ) : myScrims.length === 0 ? (
                <div className="p-10 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center space-y-4">
                  <p className="text-sm text-[#94A3B8]">
                    Tim Anda belum memiliki riwayat scrim. Buka Arena &amp; Booking Scrim untuk membuat jadwal dengan data roster otomatis.
                  </p>
                  <button
                    type="button"
                    onClick={() => setScrimSubView('arena')}
                    className="inline-flex items-center gap-2 px-5 min-h-[42px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] cursor-pointer"
                  >
                    Buka Arena &amp; Booking Scrim →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myScrims.map((sc) => {
                    const statusMeta = getTeamScrimStatusMeta(sc, normalizedName);
                    return (
                      <div
                        key={sc.id}
                        className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="font-telemetry text-xs uppercase text-[#00F0FF]">
                            {sc.game} · {sc.date} ({sc.timeSlot}) · Caster: {sc.casterName}
                          </div>
                          <div className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                            {sc.hostTeamName} <span className="text-[#FF2E5B] text-base">VS</span>{' '}
                            {sc.challengerTeamName || 'OPEN LOBBY'}
                          </div>
                          <div className="font-telemetry text-xs text-[#94A3B8]">
                            Patungan: <span className="text-[#CCFF00] font-bold tabular-nums">{formatRupiah(sc.splitCostPerTeam)}/tim</span>
                            {sc.resultRecorded && (
                              <span className="ml-2 text-[#00F0FF] font-bold tabular-nums">
                                · SKOR AKHIR: {sc.hostScore} - {sc.challengerScore}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#94A3B8] pt-0.5">{statusMeta.hint}</p>
                        </div>
                        <div className="flex flex-col sm:items-end gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0C10] border rounded-[4px] font-telemetry text-xs font-bold uppercase ${statusMeta.color}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            {statusMeta.label}
                          </span>
                          {(() => {
                            const side =
                              sc.hostTeamName.trim().toUpperCase() === normalizedName
                                ? 'host'
                                : 'challenger';
                            const linkedInvoice = myPayments.find(
                              (p) =>
                                p.scrimId === sc.id &&
                                p.category === 'SCRIM_SPLIT_BILL' &&
                                p.scrimSide === side
                            );
                            if (linkedInvoice) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedInvoiceId(linkedInvoice.id);
                                    setActiveTab('payments');
                                  }}
                                  className="px-3.5 py-1.5 bg-[#00F0FF] text-[#0A0C10] font-telemetry text-[11px] font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer"
                                >
                                  {linkedInvoice.status === 'VERIFIED'
                                    ? 'Lihat Invoice Lunas →'
                                    : linkedInvoice.status === 'PENDING_VALIDATION'
                                      ? 'Pantau Validasi →'
                                      : 'Bayar & Lihat Invoice →'}
                                </button>
                              );
                            }
                            if (statusMeta.needsAction) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => setScrimSubView('arena')}
                                  className="px-3.5 py-1.5 bg-[#CCFF00] text-[#0A0C10] font-telemetry text-[11px] font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer"
                                >
                                  Tindak Lanjut di Scrim Arena →
                                </button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2B: INVOICE, PAYMENT VALIDATION & HISTORY */}
          {activeTab === 'payments' && (
            <PaymentDetailCenter
              role="TEAM"
              payments={myPayments}
              ledger={db.ledger || []}
              currentUser={user}
              initialSelectedPaymentId={selectedInvoiceId}
              onClearInitialSelected={() => setSelectedInvoiceId(null)}
              onRefresh={onRefresh}
              onNotify={onNotify}
            />
          )}

          {/* TAB 3: TURNAMEN */}
          {activeTab === 'tournaments' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                <div>
                  <h1 className="font-display text-2xl font-bold uppercase text-[#F8FAFC]">
                    Turnamen &amp; Pendaftaran Tim
                  </h1>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Pantau status check-in squad, inspeksi bagan pertandingan, atau daftar turnamen cabang{' '}
                    <span className="text-[#00F0FF] font-semibold">{effectiveTeamGame}</span> langsung dari portal ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openTeamRegister()}
                  className="px-4 min-h-[40px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.35)] cursor-pointer whitespace-nowrap"
                >
                  + Daftar Turnamen ({effectiveTeamGame})
                </button>
              </div>

              {/* Registered Tournaments */}
              <div className="space-y-3">
                <h2 className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                  Status Squad Terdaftar ({mySquads.length})
                </h2>
                {mySquads.length === 0 ? (
                  <div className="p-8 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center space-y-4">
                    <p className="text-sm text-[#94A3B8]">
                      Tim Anda belum terdaftar di turnamen aktif. Gunakan pendaftaran cepat dengan data roster profil Anda di bawah ini.
                    </p>
                    <button
                      type="button"
                      onClick={() => openTeamRegister()}
                      className="inline-flex items-center gap-2 px-5 min-h-[42px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] cursor-pointer"
                    >
                      Daftar Turnamen Pertama →
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mySquads.map((sq) => {
                      const trn = db.tournaments.find((t) => t.id === sq.tournamentId);
                      const checkInLabel =
                        sq.checkInStatus === 'CHECKED IN'
                          ? 'TERVERIFIKASI CHECK-IN'
                          : sq.checkInStatus === 'DISQUALIFIED'
                            ? 'DISKUALIFIKASI'
                            : 'MENUNGGU CHECK-IN';
                      return (
                        <div
                          key={sq.id}
                          className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col justify-between gap-4"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between font-telemetry text-xs uppercase">
                              <span className="text-[#00F0FF] font-bold">{trn?.game || 'ESPORTS'}</span>
                              <span
                                className={`font-bold ${
                                  sq.checkInStatus === 'CHECKED IN'
                                    ? 'text-[#00F0FF]'
                                    : sq.checkInStatus === 'DISQUALIFIED'
                                      ? 'text-[#FF2E5B]'
                                      : 'text-[#CCFF00]'
                                }`}
                              >
                                {checkInLabel}
                              </span>
                            </div>
                            <div className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                              {trn?.name || sq.tournamentId}
                            </div>
                            <div className="font-telemetry text-xs text-[#94A3B8]">
                              Squad: {sq.name} [{sq.tag}] · Kapten: {sq.captainIgn}
                            </div>
                          </div>

                          {trn && (
                            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.06]">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveTournamentHub({ tournament: trn, initialTab: 'overview' })
                                }
                                className="flex-1 min-h-[38px] px-3 py-1.5 bg-white/[0.04] border border-white/15 hover:border-[#00F0FF] text-[#F8FAFC] hover:text-[#00F0FF] font-telemetry text-[11px] font-bold uppercase rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
                              >
                                Info &amp; Peserta
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveTournamentHub({ tournament: trn, initialTab: 'bracket' })
                                }
                                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 bg-[#00F0FF]/12 border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF] hover:text-[#0A0C10] font-telemetry text-[11px] font-bold uppercase rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                Lihat Bagan
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Open / Active Tournaments in Team Division */}
              <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
                    Turnamen Cabang {effectiveTeamGame} ({divisionTournaments.length})
                  </h2>
                  <span className="font-telemetry text-[11px] text-[#94A3B8]">
                    Otomatis disesuaikan dengan Game Utama tim Anda
                  </span>
                </div>

                {divisionTournaments.length === 0 ? (
                  <div className="p-6 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-sm text-[#94A3B8]">
                    Belum ada turnamen terjadwal untuk cabang {effectiveTeamGame}. Ubah Game Utama di tab Profil jika tim Anda berpindah divisi.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {divisionTournaments.map((trn) => {
                      const alreadyRegistered = mySquads.some((sq) => sq.tournamentId === trn.id);
                      const isFull = trn.registeredTeams >= trn.maxTeams;
                      const canQuickRegister = trn.status === 'OPEN' && !isFull && !alreadyRegistered;
                      return (
                        <div
                          key={trn.id}
                          className="p-5 bg-[#12161F] border border-white/[0.08] hover:border-[#00F0FF]/35 rounded-[6px] flex flex-col justify-between gap-4 transition-colors"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 font-telemetry text-[11px] uppercase">
                              <span className="text-[#00F0FF] font-bold">
                                {trn.game} · {trn.format}
                              </span>
                              <span
                                className={
                                  trn.status === 'OPEN'
                                    ? 'text-[#CCFF00] font-bold'
                                    : trn.status === 'ONGOING'
                                      ? 'text-[#FF2E5B] font-bold'
                                      : 'text-[#94A3B8]'
                                }
                              >
                                {trn.status === 'OPEN'
                                  ? 'Dibuka'
                                  : trn.status === 'ONGOING'
                                    ? 'Berlangsung'
                                    : 'Selesai'}
                              </span>
                            </div>
                            <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                              {trn.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-telemetry text-xs text-[#94A3B8]">
                              <span className="inline-flex items-center gap-1 text-[#CCFF00] font-bold">
                                <Trophy className="w-3.5 h-3.5" />
                                {trn.prizePool}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-[#00F0FF]" />
                                {trn.startDate}
                              </span>
                              <span className="tabular-nums">
                                {trn.registeredTeams}/{trn.maxTeams} Tim
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.06]">
                            {alreadyRegistered ? (
                              <span className="flex-1 min-h-[38px] px-3 py-1.5 bg-[#00F0FF]/10 border border-[#00F0FF]/35 text-[#00F0FF] font-telemetry text-[11px] font-bold uppercase rounded-[4px] inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Sudah Terdaftar
                              </span>
                            ) : canQuickRegister ? (
                              <button
                                type="button"
                                onClick={() => openTeamRegister(trn.id)}
                                className="flex-1 min-h-[38px] px-3.5 py-1.5 bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer whitespace-nowrap"
                              >
                                Daftar Cepat →
                              </button>
                            ) : (
                              <span className="flex-1 min-h-[38px] px-3 py-1.5 bg-white/[0.04] border border-white/10 text-[#94A3B8] font-telemetry text-[11px] uppercase rounded-[4px] inline-flex items-center justify-center whitespace-nowrap">
                                {isFull ? 'Kuota Penuh' : 'Pendaftaran Ditutup'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setActiveTournamentHub({ tournament: trn, initialTab: 'bracket' })
                              }
                              className="min-h-[38px] px-3.5 py-1.5 border border-white/20 text-[#F8FAFC] hover:border-[#00F0FF] hover:text-[#00F0FF] font-display text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Lihat Bagan
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* In-Portal Modals */}
      <RegisterSquadModal
        isOpen={registerModalOpen}
        tournaments={db.tournaments}
        defaultTournamentId={registerTournamentId}
        teamProfile={profile}
        onClose={() => setRegisterModalOpen(false)}
        onSubmit={onCreateSquad}
      />

      {activeTournamentHub && (
        <TournamentDetailHub
          tournament={activeTournamentHub.tournament}
          initialTab={activeTournamentHub.initialTab}
          matches={db.matches}
          squads={db.squads}
          activeTeamGame={effectiveTeamGame}
          onClose={() => setActiveTournamentHub(null)}
          onRegister={(trnId) => {
            setActiveTournamentHub(null);
            openTeamRegister(trnId);
          }}
          onSelectMatch={setSelectedMatch}
          onSelectSquad={setSelectedSquad}
          onNotify={onNotify}
        />
      )}

      <SquadProfileModal
        target={selectedSquad}
        squads={db.squads}
        matches={db.matches}
        tournaments={db.tournaments}
        scrims={db.scrims}
        onClose={() => setSelectedSquad(null)}
        onSelectOpponent={setSelectedSquad}
        onSelectMatch={(match) => {
          setSelectedSquad(null);
          setSelectedMatch(match);
        }}
      />

      <MatchDetailModal
        match={selectedMatch}
        onClose={() => setSelectedMatch(null)}
        onNotify={onNotify}
      />
    </div>
  );
};
