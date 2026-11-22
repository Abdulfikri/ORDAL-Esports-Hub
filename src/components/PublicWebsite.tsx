import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Copy,
  LogOut,
  Menu,
  Mic,
  Radio,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api';
import type {
  AuthUser,
  GameTitle,
  Match,
  MatchStatus,
  NewsArticle,
  OrdalDatabase,
  Tournament,
  UserRole,
} from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useMatchNotifications } from '../hooks/useMatchNotifications';
import type { TeamAuthPrefill } from './AuthGate';
import {
  NewsCardArtwork,
  OrdalWordmark,
} from './BrandAssets';
import { CasterBadges } from './CasterBadges';
import { CasterScheduleModal } from './CasterScheduleModal';
import { FeatureTournamentCountdown } from './FeatureTournamentCountdown';
import { LiveMatchTicker } from './LiveMatchTicker';
import { MatchNotificationButton } from './MatchNotificationButton';
import { MatchDetailModal, RegisterSquadModal } from './Modals';
import { formatRupiah, ScrimArena } from './ScrimArena';
import { SquadProfileModal, type SquadProfileTarget } from './SquadProfileModal';
import { TournamentCalendar } from './TournamentCalendar';
import {
  TournamentDetailHub,
  type TournamentDetailTab,
} from './TournamentDetailHub';
import { TournamentHighlightModal } from './TournamentHighlightModal';
import { TournamentLiveStreamModal } from './TournamentLiveStreamModal';

interface PublicWebsiteProps {
  db: OrdalDatabase;
  currentUser: AuthUser | null;
  onOpenAuth: (
    role?: UserRole,
    options?: { mode?: 'login' | 'register'; prefillTeam?: TeamAuthPrefill }
  ) => void;
  onOpenRolePortal: (role: UserRole) => void;
  onLogout: () => void;
  onCreateSquad: (payload: {
    name: string;
    tag: string;
    tournamentId: string;
    captainIgn: string;
    captainContact: string;
    roster: string[];
    captchaToken?: string;
  }) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  db,
  currentUser,
  onOpenAuth,
  onOpenRolePortal,
  onLogout,
  onCreateSquad,
  onRefresh,
  onNotify,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const teamPrimaryGame =
    currentUser?.role === 'TEAM' ? currentUser.teamProfile?.primaryGame : undefined;
  const [gameFilter, setGameFilter] = useState<'ALL' | GameTitle>(teamPrimaryGame || 'ALL');
  useEffect(() => {
    setGameFilter(teamPrimaryGame || 'ALL');
  }, [currentUser?.id, teamPrimaryGame]);
  const [activeTournamentHub, setActiveTournamentHub] = useState<{
    tournament: Tournament;
    initialTab: TournamentDetailTab;
  } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedSquad, setSelectedSquad] = useState<SquadProfileTarget | null>(null);
  const [highlightTournament, setHighlightTournament] = useState<Tournament | null>(null);
  const [liveStreamTournament, setLiveStreamTournament] = useState<Tournament | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerTournamentId, setRegisterTournamentId] = useState<string | undefined>(undefined);
  const [activeArticle, setActiveArticle] = useState<NewsArticle | null>(null);
  const [casterFilter, setCasterFilter] = useState<'ALL' | 'TOP_CASTER' | 'VERIFIED'>('ALL');
  const [publicCasterModalTarget, setPublicCasterModalTarget] = useState<string | null>(null);
  const [ecosystemTab, setEcosystemTab] = useState<'scrim' | 'kalender' | 'casters'>('scrim');
  const [guestRegisteredDraft, setGuestRegisteredDraft] = useState<TeamAuthPrefill | null>(null);
  const [externalScrimBooking, setExternalScrimBooking] = useState<{
    casterId: string;
    date: string;
    nonce: number;
  } | null>(null);

  useEscapeKey(Boolean(activeArticle), () => handleCloseArticle());

  const updateUrlParams = (mutator: (params: URLSearchParams) => void, hashOverride?: string) => {
    const params = new URLSearchParams(window.location.search);
    mutator(params);
    const search = params.toString();
    const nextHash = hashOverride !== undefined ? hashOverride : window.location.hash;
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${nextHash}`;
    window.history.replaceState(null, '', nextUrl);
  };

  const handleCloseArticle = () => {
    setActiveArticle(null);
    updateUrlParams((params) => {
      params.delete('news');
    });
  };

  const handleOpenArticle = (article: NewsArticle) => {
    setActiveArticle(article);
    updateUrlParams((params) => {
      params.set('news', article.id);
    }, '#news');
  };

  const handleSelectEcosystemTab = (tab: 'scrim' | 'kalender' | 'casters') => {
    setEcosystemTab(tab);
    updateUrlParams((params) => {
      params.set('hub', tab);
    }, '#ecosystem-hub');
  };

  const jumpToEcosystemTab = (tab: 'scrim' | 'kalender' | 'casters') => {
    handleSelectEcosystemTab(tab);
    setMobileMenuOpen(false);
    window.setTimeout(() => {
      document.getElementById('ecosystem-hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const initialDeepLinkHandledRef = useRef(false);

  useEffect(() => {
    if (initialDeepLinkHandledRef.current) return;
    initialDeepLinkHandledRef.current = true;
    const VALID_HUB_TABS = new Set(['scrim', 'kalender', 'casters']);
    const VALID_TRN_TABS = new Set<TournamentDetailTab>([
      'overview',
      'bracket',
      'participants',
      'matches',
      'rules',
    ]);
    const params = new URLSearchParams(window.location.search);
    const hubParam = params.get('hub');
    const trnParam = params.get('trn');
    const tabParam = params.get('tab') as TournamentDetailTab | null;
    const newsParam = params.get('news');

    if (trnParam) {
      const matchedTrn = db.tournaments.find((t) => t.id === trnParam);
      if (matchedTrn) {
        const safeTab: TournamentDetailTab =
          tabParam && VALID_TRN_TABS.has(tabParam) ? tabParam : 'overview';
        setActiveTournamentHub({ tournament: matchedTrn, initialTab: safeTab });
      }
    }

    if (newsParam) {
      const matchedArticle = db.news.find((n) => n.id === newsParam);
      if (matchedArticle) {
        setActiveArticle(matchedArticle);
      }
    }

    if (hubParam && VALID_HUB_TABS.has(hubParam)) {
      const targetTab = hubParam as 'scrim' | 'kalender' | 'casters';
      setEcosystemTab(targetTab);
      window.setTimeout(() => {
        document.getElementById('ecosystem-hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      return;
    }

    const hash = window.location.hash;
    if (hash === '#scrim') jumpToEcosystemTab('scrim');
    else if (hash === '#kalender') jumpToEcosystemTab('kalender');
    else if (hash === '#casters') jumpToEcosystemTab('casters');
  }, [db.tournaments, db.news]);

  const hero = db.heroSettings;

  const featuredTournament: Tournament | undefined = useMemo(() => {
    if (hero?.featuredTournamentId) {
      const matched = db.tournaments.find((t) => t.id === hero.featuredTournamentId);
      if (matched) return matched;
    }
    return db.tournaments.find((t) => t.status === 'ONGOING') || db.tournaments[0];
  }, [db.tournaments, hero?.featuredTournamentId]);

  const heroEyebrowPrimary = hero?.eyebrowPrimary?.trim() || 'ORDAL ESPORTS HUB';
  const heroEyebrowSecondary =
    hero?.eyebrowSecondary !== undefined
      ? hero.eyebrowSecondary.trim()
      : 'POINT BLANK · FREE FIRE · EFOOTBALL';
  const heroHeadline =
    hero?.headline?.trim() ||
    featuredTournament?.name ||
    'ARENA TURNAMEN POINT BLANK, FREE FIRE & EFOOTBALL';
  const heroSubtitle =
    hero?.subtitle?.trim() ||
    featuredTournament?.description ||
    'Ikuti turnamen resmi, pantau bagan pertandingan secara langsung, dan jadwalkan latihan scrim ber-shoutcaster untuk tim Point Blank, Free Fire, dan eFootball Anda.';
  const heroPrimaryCtaLabel = hero?.primaryCtaLabel?.trim() || 'Daftar Turnamen';
  const heroSecondaryCtaLabel = hero?.secondaryCtaLabel?.trim() || 'Lihat Jadwal';
  const heroSecondaryCtaHref = hero?.secondaryCtaHref?.trim() || '#turnamen';
  const heroBackgroundImageUrl = hero?.backgroundImageUrl?.trim() || '';

  const liveMatches = useMemo(
    () => db.matches.filter((m) => m.status === 'LIVE'),
    [db.matches]
  );

  const upcomingMatches = useMemo(
    () => db.matches.filter((m) => m.status === 'UPCOMING'),
    [db.matches]
  );

  const finishedMatches = useMemo(
    () => db.matches.filter((m) => m.status === 'FINISHED'),
    [db.matches]
  );

  const [matchStatusFilter, setMatchStatusFilter] = useState<'ALL' | MatchStatus>('ALL');

  const filteredHeroMatches = useMemo(() => {
    if (matchStatusFilter === 'LIVE') return liveMatches;
    if (matchStatusFilter === 'UPCOMING') return upcomingMatches;
    if (matchStatusFilter === 'FINISHED') return finishedMatches;
    return [...liveMatches, ...upcomingMatches, ...finishedMatches];
  }, [matchStatusFilter, liveMatches, upcomingMatches, finishedMatches]);

  const { isNotified, toggleMatchNotification } = useMatchNotifications(onNotify);

  const filteredTournaments = useMemo(() => {
    if (gameFilter === 'ALL') return db.tournaments;
    return db.tournaments.filter((t) => t.game === gameFilter);
  }, [db.tournaments, gameFilter]);

  const handleOpenTournamentHub = (
    tournament: Tournament,
    initialTab: TournamentDetailTab = 'overview'
  ) => {
    setActiveTournamentHub({ tournament, initialTab });
    updateUrlParams((params) => {
      params.set('trn', tournament.id);
      params.set('tab', initialTab);
    }, '#turnamen');
  };

  const handleCloseTournamentHub = () => {
    setActiveTournamentHub(null);
    updateUrlParams((params) => {
      params.delete('trn');
      params.delete('tab');
    });
  };

  const handleOpenRegister = (tournamentId?: string) => {
    if (currentUser?.role === 'CASTER') {
      onNotify('Akun Shoutcaster tidak dapat mendaftar sebagai peserta turnamen.');
      return;
    }
    if (teamPrimaryGame) {
      if (tournamentId) {
        const target = db.tournaments.find((t) => t.id === tournamentId);
        if (target && target.game !== teamPrimaryGame) {
          onNotify(
            `Tim Anda terdaftar di cabang ${teamPrimaryGame}. Hanya tim ${target.game} yang dapat mendaftar turnamen ini.`
          );
          return;
        }
      }
      const matchingOpen = db.tournaments.find(
        (t) =>
          t.game === teamPrimaryGame &&
          t.status === 'OPEN' &&
          t.registeredTeams < t.maxTeams
      );
      const fallbackMatching = db.tournaments.find((t) => t.game === teamPrimaryGame);
      setRegisterTournamentId(tournamentId || matchingOpen?.id || fallbackMatching?.id);
      setRegisterModalOpen(true);
      return;
    }
    setRegisterTournamentId(tournamentId || featuredTournament?.id);
    setRegisterModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#F8FAFC] flex flex-col">
      {/* Global Sticky Top Navigation (Clean 3-Zone Contract) */}
      <header className="sticky top-0 z-40 glass-shield border-b border-white/[0.06]">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-8 h-16 flex items-center justify-between gap-2 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a href="#top" className="flex items-center shrink-0 focus-visible:outline-none max-w-[148px] sm:max-w-none overflow-hidden">
            <OrdalWordmark height={36} />
          </a>

          {/* Zone 2: Concise Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            <a href="#turnamen" className="hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0">
              Turnamen
            </a>
            <button
              type="button"
              onClick={() => jumpToEcosystemTab('kalender')}
              className="hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer uppercase"
            >
              Kalender
            </button>
            <button
              type="button"
              onClick={() => jumpToEcosystemTab('scrim')}
              className="hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer uppercase"
            >
              Scrim
            </button>
            <button
              type="button"
              onClick={() => jumpToEcosystemTab('casters')}
              className="hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer uppercase"
            >
              Caster
            </button>
            <a href="#news" className="hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0">
              Berita
            </a>
          </nav>

          {/* Zone 3: Role-Aware Auth / Dashboard CTA */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenRolePortal(currentUser.role)}
                  className="px-3 sm:px-4 min-h-[40px] sm:min-h-[42px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] hover:-translate-y-[1px] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {currentUser.role === 'TEAM'
                    ? 'Dashboard Team'
                    : currentUser.role === 'CASTER'
                      ? 'Dashboard Caster'
                      : currentUser.role === 'LEAGUE_OPS'
                        ? 'League Ops'
                        : 'Super Admin'}
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  title="Keluar akun"
                  aria-label="Keluar akun"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center border border-white/15 text-[#94A3B8] hover:text-[#FF2E5B] hover:border-[#FF2E5B]/50 rounded-[4px] transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth()}
                className="px-3.5 sm:px-4 min-h-[40px] sm:min-h-[42px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] hover:-translate-y-[1px] transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                Masuk / Daftar
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Menu navigasi"
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-[#F8FAFC] border border-white/10 rounded-[4px] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden px-4 py-3 bg-[#12161F] border-t border-white/[0.08] flex flex-col gap-1 font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#F8FAFC]">
            <a
              href="#turnamen"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] px-2 flex items-center rounded-[4px] hover:bg-white/[0.04] hover:text-[#00F0FF]"
            >
              Turnamen
            </a>
            {(
              [
                { tab: 'kalender', label: 'Kalender' },
                { tab: 'scrim', label: 'Scrim Arena' },
                { tab: 'casters', label: 'Caster' },
              ] as const
            ).map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => jumpToEcosystemTab(item.tab)}
                className="min-h-[44px] px-2 flex items-center text-left rounded-[4px] hover:bg-white/[0.04] hover:text-[#00F0FF] uppercase cursor-pointer"
              >
                {item.label}
              </button>
            ))}
            <a
              href="#news"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] px-2 flex items-center rounded-[4px] hover:bg-white/[0.04] hover:text-[#00F0FF]"
            >
              Berita
            </a>
          </div>
        )}
      </header>

      {/* P0 - CRITICAL: Live Match Ticker pinned directly below Navbar */}
      <LiveMatchTicker matches={db.matches} onSelectMatch={setSelectedMatch} />

      <main id="top" className="flex-1">
        {/* HERO SECTION */}
        <section className="relative ordal-tactical-grid border-b border-white/[0.08] overflow-hidden">
          {heroBackgroundImageUrl && (
            <img
              src={heroBackgroundImageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0C10]/45 via-[#0A0C10]/75 to-[#0A0C10] pointer-events-none" />
          <div className="relative max-w-[1440px] mx-auto px-4 sm:px-8 py-14 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
              {/* Left Focal Headline */}
              <div className="lg:col-span-7 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-telemetry text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-[#94A3B8]">
                  <span className="text-[#00F0FF]">{heroEyebrowPrimary}</span>
                  {heroEyebrowSecondary && (
                    <>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span>{heroEyebrowSecondary}</span>
                    </>
                  )}
                </div>

                <h1 className="mt-4 font-display text-3xl sm:text-5xl lg:text-[56px] font-bold uppercase leading-[1.08] tracking-[0.02em] text-[#F8FAFC] text-balance max-w-2xl">
                  {heroHeadline}
                </h1>

                <p className="mt-4 sm:mt-5 text-sm sm:text-lg text-[#94A3B8] leading-relaxed max-w-xl">
                  {heroSubtitle}
                </p>

                <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => handleOpenRegister()}
                    className="w-full sm:w-auto min-h-[46px] px-6 py-3 bg-[#FF2E5B] text-white font-display text-base font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 glow-crimson transition-all cursor-pointer whitespace-nowrap"
                  >
                    {heroPrimaryCtaLabel}
                  </button>
                  <a
                    href={heroSecondaryCtaHref}
                    target={/^https?:\/\//i.test(heroSecondaryCtaHref) ? '_blank' : undefined}
                    rel={/^https?:\/\//i.test(heroSecondaryCtaHref) ? 'noopener noreferrer' : undefined}
                    onClick={(e) => {
                      if (heroSecondaryCtaHref === '#kalender') {
                        e.preventDefault();
                        jumpToEcosystemTab('kalender');
                      } else if (heroSecondaryCtaHref === '#scrim') {
                        e.preventDefault();
                        jumpToEcosystemTab('scrim');
                      } else if (heroSecondaryCtaHref === '#casters') {
                        e.preventDefault();
                        jumpToEcosystemTab('casters');
                      }
                    }}
                    className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 px-6 py-3 border border-white/20 text-[#F8FAFC] font-display text-base font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] hover:bg-[#00F0FF]/[0.06] transition-all whitespace-nowrap"
                  >
                    {heroSecondaryCtaLabel}
                    <ArrowRight className="w-4 h-4 text-[#00F0FF]" />
                  </a>
                </div>
              </div>

              {/* Right Live Telemetry Spotlight Card */}
              <div className="lg:col-span-5 flex flex-col">
                <div className="h-full bg-[#12161F] border border-white/[0.08] rounded-[6px] p-4 sm:p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/[0.08]">
                      <div className="flex items-center gap-2 font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#FF2E5B]">
                        <span className="w-2 h-2 rounded-full bg-[#FF2E5B] live-dot-pulse" />
                        <span>{liveMatches.length} MATCH LIVE SEKARANG</span>
                      </div>
                      <span className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
                        {featuredTournament?.prizePool || 'Rp 25.000.000'}
                      </span>
                    </div>

                    {/* Interactive Match Status Filter */}
                    <div
                      role="tablist"
                      aria-label="Filter status pertandingan"
                      className="mt-4 grid grid-cols-4 gap-1 p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]"
                    >
                      {(
                        [
                          { id: 'ALL', label: 'Semua', count: db.matches.length },
                          { id: 'UPCOMING', label: 'Upcoming', count: upcomingMatches.length },
                          { id: 'LIVE', label: 'Live', count: liveMatches.length },
                          { id: 'FINISHED', label: 'Finished', count: finishedMatches.length },
                        ] as const
                      ).map((tab) => {
                        const isActive = matchStatusFilter === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setMatchStatusFilter(tab.id)}
                            className={`min-h-[34px] px-2 py-1 rounded-[3px] font-telemetry text-[10px] font-bold uppercase tracking-[0.04em] transition-colors cursor-pointer whitespace-nowrap truncate tabular-nums ${
                              isActive
                                ? tab.id === 'LIVE'
                                  ? 'bg-[#FF2E5B] text-white'
                                  : tab.id === 'UPCOMING'
                                    ? 'bg-[#CCFF00] text-[#0A0C10]'
                                    : 'bg-[#00F0FF] text-[#0A0C10]'
                                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                            }`}
                          >
                            {tab.label} ({tab.count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3.5 max-h-[268px] overflow-y-auto space-y-2.5 pr-1">
                      {filteredHeroMatches.length === 0 ? (
                        <div className="p-6 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] text-center">
                          <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                            Tidak ada match berstatus {matchStatusFilter.toLowerCase()} saat ini.
                          </p>
                        </div>
                      ) : (
                        filteredHeroMatches.map((m) => {
                          const isUpcoming = m.status === 'UPCOMING';
                          const isLive = m.status === 'LIVE';
                          const isFinished = m.status === 'FINISHED';
                          return (
                            <div
                              key={m.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedMatch(m)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedMatch(m);
                                }
                              }}
                              className="w-full text-left p-3.5 sm:p-4 bg-[#0A0C10] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[4px] transition-colors cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2 font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                                <span className="truncate">
                                  {m.game} · {m.round}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={
                                      isLive
                                        ? 'text-[#FF2E5B] font-bold'
                                        : isUpcoming
                                          ? 'text-[#CCFF00] font-bold'
                                          : isFinished
                                            ? 'text-[#94A3B8] font-semibold'
                                            : 'text-[#00F0FF]'
                                    }
                                  >
                                    {isLive ? 'LIVE' : isUpcoming ? 'UPCOMING' : 'FINISHED'}
                                  </span>
                                  {isUpcoming && (
                                    <MatchNotificationButton
                                      compact
                                      active={isNotified(m.id)}
                                      matchLabel={`${m.teamATag} vs ${m.teamBTag}`}
                                      onToggle={() => toggleMatchNotification(m)}
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                <span className="font-display text-sm sm:text-lg font-bold uppercase text-[#F8FAFC] truncate">
                                  {m.teamA}
                                </span>
                                <span className="font-telemetry text-base sm:text-lg font-bold text-[#00F0FF] tabular-nums whitespace-nowrap px-1">
                                  {m.scoreA} - {m.scoreB}
                                </span>
                                <span className="font-display text-sm sm:text-lg font-bold uppercase text-[#F8FAFC] text-right truncate">
                                  {m.teamB}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Key Metrics Strip inside spotlight footer */}
                  <div className="mt-6 pt-4 border-t border-white/[0.08] grid grid-cols-3 gap-4 font-telemetry">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.1em] text-[#94A3B8]">
                        TURNAMEN
                      </div>
                      <div className="text-xl font-bold text-[#F8FAFC] mt-0.5">
                        {db.tournaments.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.1em] text-[#94A3B8]">
                        SQUAD AKTIF
                      </div>
                      <div className="text-xl font-bold text-[#00F0FF] mt-0.5">
                        {db.squads.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.1em] text-[#94A3B8]">
                        BERITA TERKINI
                      </div>
                      <div className="text-xl font-bold text-[#CCFF00] mt-0.5">
                        {db.news.length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: TOURNAMENTS */}
        <section id="turnamen" className="scroll-mt-20 max-w-[1440px] mx-auto px-4 sm:px-8 py-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
            <div>
              <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#00F0FF]">
                TURNAMEN RESMI · POINT BLANK · FREE FIRE · EFOOTBALL
              </p>
              <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC]">
                Daftar Turnamen Kompetitif
              </h2>
            </div>

            {/* Interactive Filter Tabs */}
            <div className="w-full md:w-auto overflow-x-auto no-scrollbar">
              <div className="inline-flex items-center gap-1 p-1 bg-[#12161F] border border-white/[0.08] rounded-[4px] min-w-max">
                {(['ALL', 'POINT BLANK', 'FREE FIRE', 'EFOOTBALL'] as const).map((game) => (
                  <button
                    key={game}
                    type="button"
                    onClick={() => setGameFilter(game)}
                    className={`min-h-[38px] px-3 py-1.5 font-telemetry text-xs font-semibold uppercase tracking-[0.06em] rounded-[2px] transition-colors cursor-pointer whitespace-nowrap ${
                      gameFilter === game
                        ? 'bg-[#00F0FF] text-[#0A0C10]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {game === 'ALL' ? 'Semua Game' : game}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {teamPrimaryGame && (
            <div className="mt-4 px-4 py-2.5 bg-[#00F0FF]/8 border border-[#00F0FF]/25 rounded-[4px] flex flex-wrap items-center justify-between gap-2 font-telemetry text-xs text-[#E2E2E8]">
              <span>
                Divisi Tim Aktif: <strong className="text-[#00F0FF]">{teamPrimaryGame}</strong> ·
                Anda hanya dapat mendaftar turnamen cabang <strong>{teamPrimaryGame}</strong>.
              </span>
              {gameFilter !== teamPrimaryGame && (
                <button
                  type="button"
                  onClick={() => setGameFilter(teamPrimaryGame)}
                  className="text-[#CCFF00] font-bold uppercase hover:underline cursor-pointer"
                >
                  Fokus ke {teamPrimaryGame} →
                </button>
              )}
            </div>
          )}

          {!currentUser && guestRegisteredDraft && (
            <div
              role="status"
              className="mt-5 p-4 sm:p-5 bg-[#12161F] border border-[#CCFF00]/45 rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#CCFF00] shrink-0 mt-0.5" />
                <div>
                  <p className="font-display text-base sm:text-lg font-bold uppercase text-[#F8FAFC]">
                    Squad [{guestRegisteredDraft.teamTag}] Berhasil Terdaftar!
                  </p>
                  <p className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
                    Buat akun Tim ORDAL sekarang dengan data yang barusan Anda isi agar dapat mengelola roster inti, memantau invoice, dan booking Scrim Arena.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onOpenAuth('TEAM', {
                      mode: 'register',
                      prefillTeam: guestRegisteredDraft,
                    })
                  }
                  className="px-4 min-h-[40px] bg-[#CCFF00] text-[#0A0C10] font-display text-xs font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 cursor-pointer whitespace-nowrap"
                >
                  Buat Akun Tim [{guestRegisteredDraft.teamTag}] →
                </button>
                <button
                  type="button"
                  aria-label="Tutup banner konversi akun"
                  onClick={() => setGuestRegisteredDraft(null)}
                  className="p-2 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Dynamic Visual Countdown Widget for Upcoming Feature Tournaments */}
          <FeatureTournamentCountdown
            tournaments={db.tournaments}
            activeTeamGame={teamPrimaryGame}
            onRegister={handleOpenRegister}
            onOpenBracket={(trn) => handleOpenTournamentHub(trn, 'bracket')}
          />

          {filteredTournaments.length === 0 ? (
            <div className="mt-8 p-10 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center">
              <p className="font-display text-xl uppercase text-[#F8FAFC]">
                Belum Ada Turnamen di Cabang Game Ini
              </p>
              <p className="mt-1 text-sm text-[#94A3B8]">
                Saat ini belum ada turnamen aktif untuk cabang game yang dipilih. Silakan pilih cabang game lain atau cek kembali jadwal terbaru.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTournaments.map((trn) => {
                const slotPercent = Math.min(
                  100,
                  Math.round((trn.registeredTeams / Math.max(1, trn.maxTeams)) * 100)
                );
                return (
                  <article
                    key={trn.id}
                    className="bg-[#12161F] border border-white/[0.08] hover:border-[#00F0FF]/45 rounded-[6px] p-6 flex flex-col justify-between transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em]">
                        <span className="text-[#00F0FF]">
                          {trn.game} · {trn.format}
                        </span>
                        <span
                          className={
                            trn.status === 'ONGOING'
                              ? 'text-[#FF2E5B] font-bold'
                              : trn.status === 'OPEN'
                                ? 'text-[#CCFF00] font-bold'
                                : 'text-[#94A3B8]'
                          }
                        >
                          {trn.status === 'OPEN'
                            ? 'Pendaftaran Dibuka'
                            : trn.status === 'ONGOING'
                              ? 'Sedang Berlangsung'
                              : 'Selesai'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenTournamentHub(trn, 'overview')}
                        className="mt-3 text-left font-display text-2xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC] hover:text-[#00F0FF] leading-tight transition-colors cursor-pointer"
                      >
                        {trn.name}
                      </button>

                      <p className="mt-2.5 text-sm text-[#94A3B8] leading-relaxed">
                        {trn.description}
                      </p>

                      {/* Metadata rows */}
                      <div className="mt-5 pt-4 border-t border-white/[0.06] space-y-2 font-telemetry text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#94A3B8] inline-flex items-center gap-1.5">
                            <Trophy className="w-3.5 h-3.5 text-[#CCFF00]" /> TOTAL HADIAH
                          </span>
                          <span className="font-bold text-[#CCFF00]">{trn.prizePool}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#94A3B8] inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#00F0FF]" /> JADWAL MULAI
                          </span>
                          <span className="text-[#F8FAFC]">{trn.startDate}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#94A3B8] inline-flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-[#94A3B8]" /> KUOTA TIM
                          </span>
                          <span className="text-[#F8FAFC]">
                            {trn.registeredTeams} / {trn.maxTeams} TIM
                          </span>
                        </div>
                      </div>

                      {/* Slot progress bar */}
                      <div className="mt-3 h-1.5 w-full bg-[#0A0C10] rounded-[2px] overflow-hidden">
                        <div
                          className="h-full bg-[#00F0FF]"
                          style={{ width: `${slotPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-6 space-y-2.5">
                      <button
                        type="button"
                        onClick={() => handleOpenTournamentHub(trn, 'overview')}
                        className="w-full min-h-[42px] py-2 px-4 bg-white/[0.04] border border-white/15 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] hover:text-[#00F0FF] transition-colors cursor-pointer"
                      >
                        Lihat Info, Peserta &amp; Aturan
                      </button>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                        {trn.status === 'COMPLETED' ? (
                          <button
                            type="button"
                            onClick={() => setHighlightTournament(trn)}
                            className="flex-1 min-h-[44px] py-2.5 px-4 bg-[#CCFF00] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(204,255,0,0.35)] transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                          >
                            <Trophy className="w-4 h-4" />
                            Lihat Highlight &amp; Replay
                          </button>
                        ) : trn.status === 'ONGOING' ? (
                          <button
                            type="button"
                            onClick={() => setLiveStreamTournament(trn)}
                            className="flex-1 min-h-[44px] py-2.5 px-4 bg-[#FF2E5B] text-white font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_18px_rgba(255,46,91,0.45)] transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                          >
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            <Radio className="w-4 h-4" />
                            Tonton Siaran Langsung
                          </button>
                        ) : currentUser?.role === 'TEAM' &&
                          currentUser.teamProfile?.primaryGame &&
                          currentUser.teamProfile.primaryGame !== trn.game ? (
                          <button
                            type="button"
                            onClick={() =>
                              onNotify(
                                `Tim Anda terdaftar di cabang ${currentUser.teamProfile?.primaryGame}. Hanya tim ${trn.game} yang dapat mendaftar turnamen ini.`
                              )
                            }
                            className="flex-1 min-h-[44px] py-2.5 px-4 bg-white/[0.04] border border-white/15 text-[#94A3B8] font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#FF2E5B]/50 hover:text-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Khusus Tim {trn.game}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenRegister(trn.id)}
                            className="flex-1 min-h-[44px] py-2.5 px-4 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] transition-all cursor-pointer whitespace-nowrap"
                          >
                            Daftar Tim
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenTournamentHub(trn, 'bracket')}
                          className="min-h-[44px] py-2.5 px-4 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] hover:bg-[#00F0FF]/[0.06] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {trn.status === 'COMPLETED' ? 'Hasil Bagan' : 'Lihat Bagan'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* SECTION 2: CONSOLIDATED ARENA & EKOSISTEM HUB */}
        <section id="ecosystem-hub" className="scroll-mt-20 border-t border-white/[0.08] bg-[#0A0C10]">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 sm:py-16">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 mb-8 border-b border-white/[0.08]">
              <div>
                <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#00F0FF]">
                  OPERASIONAL KOMUNITAS &amp; TELEMETRI
                </p>
                <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC]">
                  Arena &amp; Ekosistem Hub
                </h2>
                <p className="mt-1.5 text-sm text-[#94A3B8] max-w-2xl">
                  Akses jadwal Scrim Arena, Kalender Turnamen, dan daftar Official Shoutcaster dalam satu ruang kerja interaktif.
                </p>
              </div>

              <div className="w-full lg:w-auto overflow-x-auto no-scrollbar">
                <div
                  role="tablist"
                  aria-label="Navigasi Arena dan Ekosistem Hub"
                  className="inline-flex items-center gap-1.5 p-1 bg-[#12161F] border border-white/[0.08] rounded-[4px] min-w-max"
                >
                  {(
                    [
                      {
                        id: 'scrim',
                        label: `Scrim Arena (${(db.scrims || []).filter((s) => s.status === 'OPEN_LOBBY').length} Open)`,
                        icon: Swords,
                      },
                      {
                        id: 'kalender',
                        label: 'Kalender & Jadwal',
                        icon: Calendar,
                      },
                      {
                        id: 'casters',
                        label: `Official Casters (${(db.casters || []).filter((c) => c.status !== 'INACTIVE').length})`,
                        icon: Mic,
                      },
                    ] as const
                  ).map((tab) => {
                    const Icon = tab.icon;
                    const active = ecosystemTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleSelectEcosystemTab(tab.id)}
                        className={`min-h-[40px] px-3.5 py-2 rounded-[3px] inline-flex items-center gap-2 font-telemetry text-xs font-bold uppercase tracking-[0.05em] whitespace-nowrap shrink-0 cursor-pointer tabular-nums transition-colors ${
                          active
                            ? 'bg-[#00F0FF] text-[#0A0C10]'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.04]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {ecosystemTab === 'scrim' && (
              <ScrimArena
                embedded
                scrims={db.scrims || []}
                casters={db.casters || []}
                payments={db.payments || []}
                scrimSettings={db.scrimSettings}
                currentUser={currentUser}
                teamProfile={currentUser?.role === 'TEAM' ? currentUser.teamProfile : undefined}
                externalBookingRequest={externalScrimBooking}
                onRefresh={onRefresh}
                onNotify={onNotify}
              />
            )}

            {ecosystemTab === 'kalender' && (
              <TournamentCalendar
                embedded
                tournaments={db.tournaments}
                matches={db.matches}
                activeTeamGame={teamPrimaryGame}
                onRegisterTournament={handleOpenRegister}
                onSelectMatch={setSelectedMatch}
                onOpenBracket={(trn) => handleOpenTournamentHub(trn, 'bracket')}
                onNotify={onNotify}
              />
            )}

            {ecosystemTab === 'casters' && (
              <div>
                {(() => {
                  const activeCasters = (db.casters || []).filter((c) => c.status !== 'INACTIVE');
                  const sortedCasters = [...activeCasters].sort((a, b) => {
                    const scoreA = (a.isTopCaster ? 2 : 0) + (a.isVerified ? 1 : 0);
                    const scoreB = (b.isTopCaster ? 2 : 0) + (b.isVerified ? 1 : 0);
                    return scoreB - scoreA;
                  });
                  const displayedCasters = sortedCasters.filter((c) => {
                    if (casterFilter === 'TOP_CASTER') return Boolean(c.isTopCaster);
                    if (casterFilter === 'VERIFIED') return Boolean(c.isVerified);
                    return true;
                  });
                  const verifiedCount = activeCasters.filter((c) => Boolean(c.isVerified)).length;
                  const topCount = activeCasters.filter((c) => Boolean(c.isTopCaster)).length;

                  return (
                    <>
                      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
                        <div>
                          <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#00F0FF]">
                            TALENT RESMI ORDAL · PROFIL SHOUTCASTER
                          </p>
                          <h3 className="mt-1 font-display text-3xl sm:text-4xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC]">
                            Official Shoutcaster Roster
                          </h3>
                          <p className="mt-2 text-sm text-[#94A3B8] max-w-2xl">
                            Pilih caster resmi untuk memandu pertandingan scrim atau turnamen tim Anda. Lencana{' '}
                            <span className="text-[#00F0FF] font-semibold">Verified</span> dan{' '}
                            <span className="text-[#CCFF00] font-semibold">Top Caster</span> dikelola dan diverifikasi langsung oleh admin ORDAL.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {(
                            [
                              { id: 'ALL', label: `Semua Talent (${activeCasters.length})` },
                              { id: 'TOP_CASTER', label: `Top Caster (${topCount})` },
                              { id: 'VERIFIED', label: `Verified (${verifiedCount})` },
                            ] as const
                          ).map((tab) => {
                            const active = casterFilter === tab.id;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setCasterFilter(tab.id)}
                                className={`min-h-[38px] px-3.5 py-1.5 rounded-[4px] border font-telemetry text-xs font-bold uppercase tracking-[0.06em] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                                  active
                                    ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
                                    : 'bg-[#12161F] border-white/12 text-[#94A3B8] hover:text-[#F8FAFC]'
                                }`}
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {displayedCasters.length === 0 ? (
                        <div className="mt-8 p-8 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center font-telemetry text-sm text-[#94A3B8]">
                          Belum ada Shoutcaster pada kategori badge ini.
                        </div>
                      ) : (
                        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                          {displayedCasters.map((caster) => {
                            const approvedCount = (db.scrims || []).filter(
                              (s) =>
                                s.casterId === caster.id &&
                                s.casterApprovalStatus === 'APPROVED' &&
                                s.status !== 'CANCELLED'
                            ).length;
                            const initials = (caster.alias || caster.name)
                              .split(/\s+/)
                              .map((w) => w[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase();

                            return (
                              <article
                                key={caster.id}
                                className={`bg-[#12161F] border rounded-[6px] p-6 flex flex-col justify-between gap-5 transition-colors ${
                                  caster.isTopCaster
                                    ? 'border-[#CCFF00]/35 hover:border-[#CCFF00]/70'
                                    : caster.isVerified
                                      ? 'border-[#00F0FF]/25 hover:border-[#00F0FF]/60'
                                      : 'border-white/[0.08] hover:border-white/25'
                                }`}
                              >
                                <div className="space-y-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3.5 min-w-0">
                                      <div
                                        className={`w-12 h-12 rounded-[6px] border flex items-center justify-center font-display text-lg font-bold uppercase shrink-0 ${
                                          caster.isTopCaster
                                            ? 'bg-[#CCFF00]/12 border-[#CCFF00]/50 text-[#CCFF00]'
                                            : caster.isVerified
                                              ? 'bg-[#00F0FF]/12 border-[#00F0FF]/50 text-[#00F0FF]'
                                              : 'bg-[#0A0C10] border-white/15 text-[#F8FAFC]'
                                        }`}
                                      >
                                        {initials}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">
                                          @{caster.alias}
                                        </div>
                                        <h4 className="font-display text-xl font-bold uppercase text-[#F8FAFC] truncate">
                                          {caster.name}
                                        </h4>
                                      </div>
                                    </div>
                                    <Mic className="w-4 h-4 text-[#94A3B8] shrink-0 mt-1" />
                                  </div>

                                  <CasterBadges
                                    isVerified={caster.isVerified}
                                    isTopCaster={caster.isTopCaster}
                                    size="sm"
                                    showEmptyLabel
                                  />

                                  <p className="text-sm text-[#94A3B8] leading-relaxed line-clamp-3">
                                    {caster.bio}
                                  </p>

                                  <div className="flex flex-wrap gap-1.5">
                                    {caster.specialtyGames.map((g) => (
                                      <span
                                        key={g}
                                        className="px-2 py-0.5 bg-[#0A0C10] border border-white/10 rounded-[2px] font-telemetry text-[10px] uppercase text-[#00F0FF]"
                                      >
                                        {g}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="pt-4 border-t border-white/[0.08] space-y-3">
                                  <div className="flex items-center justify-between gap-3 font-telemetry text-xs">
                                    <div>
                                      <div className="text-[10px] uppercase text-[#94A3B8]">Ratecard</div>
                                      <div className="font-bold text-[#CCFF00] tabular-nums">
                                        {formatRupiah(caster.rateCard)} / Match
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-[10px] uppercase text-[#94A3B8]">
                                        Match Dipandu
                                      </div>
                                      <div className="font-bold text-[#F8FAFC] tabular-nums">
                                        {approvedCount} Scrim
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setPublicCasterModalTarget(caster.id)}
                                    className="w-full min-h-[42px] px-4 py-2.5 bg-[#00F0FF]/12 border border-[#00F0FF]/45 hover:bg-[#00F0FF] text-[#00F0FF] hover:text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    Lihat Jadwal &amp; Booking →
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </section>

        {/* SECTION 3: NEWS */}
        <section id="news" className="scroll-mt-20 border-t border-white/[0.08] bg-[#12161F]/30">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-16">
            <div className="pb-6 border-b border-white/[0.08]">
              <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#CCFF00]">
                BERITA &amp; ANALISIS KOMUNITAS
              </p>
              <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC]">
                Berita, Meta &amp; Rekap Turnamen
              </h2>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {db.news.map((article) => (
                <article
                  key={article.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Baca artikel: ${article.title}`}
                  onClick={() => handleOpenArticle(article)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenArticle(article);
                    }
                  }}
                  className="group bg-[#12161F] border border-white/[0.08] hover:border-[#00F0FF]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF] rounded-[6px] overflow-hidden flex flex-col cursor-pointer transition-colors"
                >
                  <NewsCardArtwork article={article} />
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-xl font-bold uppercase leading-snug text-[#F8FAFC] group-hover:text-[#00F0FF] transition-colors">
                        {article.title}
                      </h3>
                      <p className="mt-2.5 text-sm text-[#94A3B8] leading-relaxed">
                        {article.excerpt}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                      <span>{article.author}</span>
                      <span>{article.publishedAt}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* Clean Footer */}
      <footer className="border-t border-white/[0.08] bg-[#0A0C10]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <OrdalWordmark height={36} />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8]">
            <a href="#turnamen" className="hover:text-[#F8FAFC] py-1">Turnamen</a>
            <button
              type="button"
              onClick={() => jumpToEcosystemTab('kalender')}
              className="hover:text-[#F8FAFC] py-1 uppercase cursor-pointer"
            >
              Kalender
            </button>
            <button
              type="button"
              onClick={() => jumpToEcosystemTab('scrim')}
              className="hover:text-[#F8FAFC] py-1 uppercase cursor-pointer"
            >
              Scrim Arena
            </button>
            <button
              type="button"
              onClick={() => jumpToEcosystemTab('casters')}
              className="hover:text-[#F8FAFC] py-1 uppercase cursor-pointer"
            >
              Caster
            </button>
            <a href="#news" className="hover:text-[#F8FAFC] py-1">Berita</a>
            {currentUser ? (
              <button
                type="button"
                onClick={() => onOpenRolePortal(currentUser.role)}
                className="text-[#00F0FF] hover:underline cursor-pointer py-1"
              >
                {currentUser.role === 'TEAM'
                  ? 'Dashboard Tim'
                  : currentUser.role === 'CASTER'
                    ? 'Dashboard Caster'
                    : currentUser.role === 'LEAGUE_OPS'
                      ? 'Dashboard League Ops'
                      : 'Dashboard Admin'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth()}
                className="text-[#00F0FF] hover:underline cursor-pointer py-1"
              >
                Masuk / Daftar
              </button>
            )}
          </div>
          <p className="font-telemetry text-xs text-[#94A3B8]">
            © 2026 ORDAL ESPORTS HUB
          </p>
        </div>
      </footer>

      {/* Fastur.gg-style Tournament Detail Hub (Overview, Bracket, Peserta, Jadwal & Match, Peraturan) */}
      {activeTournamentHub && (
        <TournamentDetailHub
          tournament={activeTournamentHub.tournament}
          initialTab={activeTournamentHub.initialTab}
          matches={db.matches}
          squads={db.squads}
          activeTeamGame={teamPrimaryGame}
          onClose={handleCloseTournamentHub}
          onTabChange={(nextTab) => {
            if (!activeTournamentHub) return;
            setActiveTournamentHub((prev) =>
              prev ? { ...prev, initialTab: nextTab } : prev
            );
            updateUrlParams((params) => {
              params.set('trn', activeTournamentHub.tournament.id);
              params.set('tab', nextTab);
            });
          }}
          onRegister={(trnId) => {
            handleCloseTournamentHub();
            handleOpenRegister(trnId);
          }}
          onSelectMatch={setSelectedMatch}
          onSelectSquad={setSelectedSquad}
          onNotify={onNotify}
          canEditBracket={
            currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'LEAGUE_OPS'
          }
          onUpdateMatch={
            currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'LEAGUE_OPS'
              ? async (matchId, patch) => {
                  try {
                    await api.updateMatch(matchId, patch);
                    await onRefresh();
                    onNotify(
                      patch.status === 'FINISHED'
                        ? 'Match selesai! Pemenang otomatis lolos ke babak berikutnya.'
                        : 'Skor & status bagan diperbarui.'
                    );
                  } catch (err) {
                    onNotify(
                      err instanceof Error ? err.message : 'Gagal memperbarui data pertandingan.'
                    );
                  }
                }
              : undefined
          }
        />
      )}

      {/* Squad Profile Analytics Modal (accessible from Tournament Bracket & Participants) */}
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

      {/* Tournament Highlight Modal (for Completed Tournaments) */}
      <TournamentHighlightModal
        tournament={highlightTournament}
        matches={db.matches}
        squads={db.squads}
        news={db.news}
        onClose={() => setHighlightTournament(null)}
        onOpenBracket={(trn) => handleOpenTournamentHub(trn, 'bracket')}
        onOpenOverview={(trn) => handleOpenTournamentHub(trn, 'overview')}
        onSelectMatch={(match) => {
          setHighlightTournament(null);
          setSelectedMatch(match);
        }}
        onSelectSquad={(sq) => {
          setHighlightTournament(null);
          setSelectedSquad(sq);
        }}
        onSelectArticle={(article) => {
          setHighlightTournament(null);
          handleOpenArticle(article);
        }}
      />

      {/* Tournament Live Stream Modal (for Ongoing Tournaments · Team Users) */}
      <TournamentLiveStreamModal
        tournament={liveStreamTournament}
        matches={db.matches}
        currentUser={currentUser}
        onClose={() => setLiveStreamTournament(null)}
        onOpenBracket={(trn) => handleOpenTournamentHub(trn, 'bracket')}
        onOpenOverview={(trn) => handleOpenTournamentHub(trn, 'overview')}
        onSelectMatch={(match) => {
          setLiveStreamTournament(null);
          setSelectedMatch(match);
        }}
        onSelectSquad={(sq) => {
          setLiveStreamTournament(null);
          setSelectedSquad(sq);
        }}
      />

      {/* Match Telemetry Modal */}
      <MatchDetailModal
        match={selectedMatch}
        onClose={() => setSelectedMatch(null)}
        onNotify={onNotify}
      />

      {/* Register Squad Modal */}
      <RegisterSquadModal
        isOpen={registerModalOpen}
        tournaments={db.tournaments}
        defaultTournamentId={registerTournamentId}
        teamProfile={currentUser?.role === 'TEAM' ? currentUser.teamProfile : undefined}
        onClose={() => setRegisterModalOpen(false)}
        onSubmit={async (payload) => {
          await onCreateSquad(payload);
          if (!currentUser) {
            setGuestRegisteredDraft({
              teamName: payload.name,
              teamTag: payload.tag,
              captainIgn: payload.captainIgn,
              captainContact: payload.captainContact,
            });
          }
        }}
      />

      {/* Public Caster Profile & Schedule Modal */}
      <CasterScheduleModal
        open={publicCasterModalTarget !== null}
        onClose={() => setPublicCasterModalTarget(null)}
        casters={db.casters || []}
        scrims={db.scrims || []}
        initialCasterId={publicCasterModalTarget}
        onBookWithCaster={(casterId, pickedDate) => {
          setPublicCasterModalTarget(null);
          setEcosystemTab('scrim');
          setExternalScrimBooking({ casterId, date: pickedDate, nonce: Date.now() });
          window.setTimeout(() => {
            document.getElementById('ecosystem-hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 40);
          onNotify(`Tanggal ${pickedDate} & caster terpilih siap di Form Booking Scrim.`);
        }}
      />

      {/* Editorial Article Reader Drawer (max-w-680px per DESIGN.md) */}
      {activeArticle && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#0A0C10]/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={activeArticle.title}
          onClick={handleCloseArticle}
        >
          <div
            className="w-full max-w-2xl bg-[#12161F] border-l border-white/10 h-full overflow-y-auto p-6 sm:p-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
              <span className="font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-[#CCFF00]">
                {activeArticle.category} · {activeArticle.readTime}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const shareUrl = `${window.location.origin}${window.location.pathname}?news=${encodeURIComponent(activeArticle.id)}#news`;
                      await navigator.clipboard.writeText(shareUrl);
                      onNotify('Link artikel berhasil disalin ke clipboard.');
                    } catch {
                      onNotify('Gagal menyalin link artikel.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/15 bg-white/[0.04] hover:border-[#00F0FF]/60 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#F8FAFC] cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-[#00F0FF]" />
                  Bagikan
                </button>
                <button
                  type="button"
                  onClick={handleCloseArticle}
                  aria-label="Tutup artikel"
                  className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 max-w-[680px]">
              <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase leading-tight text-[#F8FAFC]">
                {activeArticle.title}
              </h2>
              <div className="mt-3 font-telemetry text-xs uppercase tracking-[0.06em] text-[#94A3B8]">
                Oleh {activeArticle.author} · {activeArticle.publishedAt}
              </div>

              {activeArticle.thumbnailUrl && (
                <div className="mt-6 w-full max-w-[360px] aspect-[4/5] rounded-[6px] overflow-hidden border border-white/10 bg-[#0A0C10]">
                  <img
                    src={activeArticle.thumbnailUrl}
                    alt={activeArticle.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="mt-6 space-y-4 text-base text-[#E2E2E8] leading-7 whitespace-pre-line">
                {activeArticle.content}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
