import type {
  AdminGameAnalyticsResponse,
  AuditIntegrityReport,
  AuditLogEntry,
  AuthLoginResponse,
  AuthLoginSuccess,
  AuthUser,
  BrandSettings,
  CasterWithdrawal,
  GatewayChannel,
  HeroSettings,
  Match,
  NewsArticle,
  OrdalDatabase,
  PaymentMethod,
  PaymentRecord,
  ScrimGame,
  ScrimSession,
  ScrimSettings,
  Shoutcaster,
  SocBlockedIp,
  SocEvent,
  SocEventStatus,
  SocOverviewResponse,
  SocPolicy,
  Squad,
  TeamProfile,
  Tournament,
  TwoFactorSetupResponse,
} from './types';
import {
  blockSocIpInFirestore,
  casterDecisionInFirestore,
  challengeScrimInFirestore,
  createCasterInFirestore,
  createGatewayCheckoutInFirestore,
  createLeagueOpsUserInFirestore,
  createMatchInFirestore,
  createNewsInFirestore,
  createScrimInFirestore,
  createSquadInFirestore,
  createTournamentInFirestore,
  deleteLeagueOpsUserInFirestore,
  deleteMatchInFirestore,
  deleteNewsInFirestore,
  deleteScrimInFirestore,
  deleteSquadInFirestore,
  deleteTournamentInFirestore,
  downloadAdminExportFromFirestore,
  generateBracketInFirestore,
  getAdminGameAnalyticsFromFirestore,
  getAdminUsersInFirestore,
  getAuditLogsInFirestore,
  getCurrentAuthSession,
  getFullOrdalState,
  getSocOverviewFromFirestore,
  payScrimAsAdminInFirestore,
  proposeScrimRescheduleInFirestore,
  recordScrimResultInFirestore,
  releaseScrimInFirestore,
  requestCasterWithdrawalInFirestore,
  requestScrimRefundInFirestore,
  respondScrimRescheduleInFirestore,
  runSocSelfTestInFirestore,
  seedFirestoreIfEmpty,
  selectScrimChallengerInFirestore,
  signInWithGoogleRole,
  signOutAccount,
  simulateSandboxPaymentInFirestore,
  submitPaymentInFirestore,
  unblockSocIpInFirestore,
  updateBrandSettingsInFirestore,
  updateCasterBadgesInFirestore,
  updateCasterInFirestore,
  updateHeroSettingsInFirestore,
  updateMatchInFirestore,
  updateNewsInFirestore,
  updateScrimInFirestore,
  updateScrimSettingsInFirestore,
  updateScrimStreamLinkInFirestore,
  updateSocEventStatusInFirestore,
  updateSocPolicyInFirestore,
  updateSquadInFirestore,
  updateTeamProfileInFirestore,
  updateTournamentInFirestore,
  updateWithdrawalStatusInFirestore,
  validatePaymentInFirestore,
  type TeamOnboardingPrefillInput,
} from './lib/firestoreStore';
import { auth } from './lib/firebase';

export const LAST_ACTIVITY_KEY = 'ordal_last_activity_at';
export const SESSION_CHANNEL_NAME = 'ordal_session_sync';
export const SESSION_EXPIRED_EVENT = 'ordal:session-expired';

const LEGACY_TOKEN_KEY = 'ordal_auth_token';

let memoryCsrfToken: string | null = null;
let activeSessionFlag = false;

try {
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.sessionStorage.removeItem(LEGACY_TOKEN_KEY);
} catch {
  // ignore storage errors in restricted iframes
}

export function getClientCsrfToken(): string | null {
  return memoryCsrfToken;
}

export function setClientCsrfToken(token: string | null): void {
  memoryCsrfToken = token;
}

export function markSessionActive(active: boolean): void {
  activeSessionFlag = active;
  if (!active) {
    memoryCsrfToken = null;
    clearLastActivityAt();
  }
}

export function broadcastSessionSync(payload: { type: 'LOGOUT' | 'ACTIVITY'; ts?: number }): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SESSION_CHANNEL_NAME);
      ch.postMessage(payload);
      ch.close();
    }
  } catch {
    // ignore BroadcastChannel errors in restricted contexts
  }
}

export function getLastActivityAt(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    const now = Date.now();
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, now) : null;
  } catch {
    return null;
  }
}

export function recordLastActivityAt(ts: number = Date.now()): void {
  try {
    const safeTs = Math.min(ts, Date.now());
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(safeTs));
  } catch {
    // ignore storage errors in restricted iframes
  }
}

export function clearLastActivityAt(): void {
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore storage errors
  }
}

export function isSessionCurrentlyActive(): boolean {
  return activeSessionFlag;
}

export const api = {
  getState: () => getFullOrdalState(),
  resetState: async (): Promise<OrdalDatabase> => {
    await seedFirestoreIfEmpty();
    return getFullOrdalState();
  },
  updateHeroSettings: (data: Partial<HeroSettings>) => updateHeroSettingsInFirestore(data),
  updateBrandSettings: (data: Partial<BrandSettings>) => updateBrandSettingsInFirestore(data),
  updateScrimSettings: (data: {
    defaultLobbyFee: number;
    lobbyFeeByGame?: Partial<Record<ScrimGame, number>>;
    applyToOpenScrims?: boolean;
  }) => updateScrimSettingsInFirestore(data),

  // Firebase Auth (Google Sign-In) & Role Sessions
  authGoogleLogin: async (
    onboardingTeam?: TeamOnboardingPrefillInput
  ): Promise<AuthLoginSuccess> => {
    const user = await signInWithGoogleRole(onboardingTeam);
    setClientCsrfToken('firebase-id-token');
    markSessionActive(true);
    recordLastActivityAt(Date.now());
    return {
      mfaRequired: false,
      user,
      csrfToken: 'firebase-id-token',
      idleTimeoutMs: 30 * 60 * 1000,
    };
  },
  authLogin: async (_email: string, _password: string): Promise<AuthLoginResponse> => {
    return api.authGoogleLogin();
  },
  authLoginMfa: async (_mfaToken: string, _code: string): Promise<AuthLoginSuccess> => {
    return api.authGoogleLogin();
  },
  setup2fa: async (): Promise<TwoFactorSetupResponse> => {
    throw new Error('Autentikasi 2FA dikelola melalui Akun Google Anda.');
  },
  verifySetup2fa: async (_code: string) => {
    throw new Error('Autentikasi 2FA dikelola melalui Akun Google Anda.');
  },
  disable2fa: async (_password: string, _code: string) => {
    throw new Error('Autentikasi 2FA dikelola melalui Akun Google Anda.');
  },
  authRegisterTeam: async (data: {
    email?: string;
    password?: string;
    teamName: string;
    teamTag: string;
    captainIgn: string;
    captainContact?: string;
    primaryGame?: string;
    captchaToken?: string;
  }) => {
    const res = await api.authGoogleLogin({
      teamName: data.teamName,
      teamTag: data.teamTag,
      captainIgn: data.captainIgn,
      captainContact: data.captainContact,
      primaryGame: (data.primaryGame as ScrimGame) || 'POINT BLANK',
    });
    return { user: res.user, csrfToken: res.csrfToken, idleTimeoutMs: res.idleTimeoutMs };
  },
  authMe: async () => {
    const res = await getCurrentAuthSession();
    if (res.authenticated && res.user) {
      setClientCsrfToken(res.csrfToken || null);
      markSessionActive(true);
    } else {
      markSessionActive(false);
    }
    return {
      ...res,
      adminSetupRequired: false,
      adminEmail: null as string | null,
    };
  },
  authKeepAlive: async () => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true).catch(() => {});
    }
    return {
      ok: Boolean(auth.currentUser),
      lastActivityAt: Date.now(),
      idleTimeoutMs: 30 * 60 * 1000,
      csrfToken: 'firebase-id-token',
    };
  },
  authLogout: async (_csrfOverride?: string | null) => {
    markSessionActive(false);
    await signOutAccount();
    return { ok: true };
  },
  updateTeamProfile: (data: Partial<TeamProfile>) => updateTeamProfileInFirestore(data),

  // Tournaments
  createTournament: (data: Partial<Tournament>) => createTournamentInFirestore(data),
  updateTournament: (id: string, data: Partial<Tournament>) =>
    updateTournamentInFirestore(id, data),
  deleteTournament: (id: string) => deleteTournamentInFirestore(id),
  generateBracket: (id: string) => generateBracketInFirestore(id),

  // Matches
  createMatch: (data: Partial<Match>) => createMatchInFirestore(data),
  updateMatch: (id: string, data: Partial<Match>) => updateMatchInFirestore(id, data),
  deleteMatch: (id: string) => deleteMatchInFirestore(id),

  // Squads
  createSquad: (data: Partial<Squad> & { roster?: string[] | string; captchaToken?: string }) =>
    createSquadInFirestore(data),
  updateSquad: (id: string, data: Partial<Squad> & { roster?: string[] | string }) =>
    updateSquadInFirestore(id, data),
  deleteSquad: (id: string) => deleteSquadInFirestore(id),

  // News
  createNews: (data: Partial<NewsArticle>) => createNewsInFirestore(data),
  updateNews: (id: string, data: Partial<NewsArticle>) => updateNewsInFirestore(id, data),
  deleteNews: (id: string) => deleteNewsInFirestore(id),

  // Scrim All Game
  createScrim: (data: Partial<ScrimSession>) => createScrimInFirestore(data),
  updateScrim: (id: string, data: Partial<ScrimSession>) => updateScrimInFirestore(id, data),
  deleteScrim: (id: string) => deleteScrimInFirestore(id),
  challengeScrim: (
    id: string,
    data: {
      challengerTeamName: string;
      challengerTeamLogo: string;
      challengerRosterCore: string[];
      challengerRosterSub: string[];
      note?: string;
    }
  ) => challengeScrimInFirestore(id, data),
  selectScrimChallenger: (
    id: string,
    applicationId: string,
    action: 'SELECT' | 'REJECT' = 'SELECT'
  ) => selectScrimChallengerInFirestore(id, applicationId, action),
  approveScrim: (id: string) => casterDecisionInFirestore(id, 'APPROVED'),
  rejectScrim: (id: string) => casterDecisionInFirestore(id, 'REJECTED'),
  payScrim: (id: string, side: 'host' | 'challenger') => payScrimAsAdminInFirestore(id, side),
  releaseScrim: (id: string) => releaseScrimInFirestore(id),
  casterDecision: (id: string, decision: 'APPROVED' | 'REJECTED') =>
    casterDecisionInFirestore(id, decision),
  proposeScrimReschedule: (
    id: string,
    data: { proposedDate: string; proposedTimeSlot: string; reason?: string }
  ) => proposeScrimRescheduleInFirestore(id, data),
  respondScrimReschedule: (id: string, decision: 'ACCEPTED' | 'DECLINED') =>
    respondScrimRescheduleInFirestore(id, decision),
  requestScrimRefund: (
    id: string,
    data: {
      bankOrWallet: string;
      accountNumber: string;
      accountName: string;
      reason?: string;
    }
  ) => requestScrimRefundInFirestore(id, data),
  recordScrimResult: (id: string, data: { hostScore: number; challengerScore: number }) =>
    recordScrimResultInFirestore(id, data),

  // Shoutcasters
  createCaster: (data: {
    name: string;
    alias?: string;
    email: string;
    password?: string;
    rateCard: number;
    maxMatchesPerDay?: number;
    specialtyGames: ScrimGame[];
    bio?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    isVerified?: boolean;
    isTopCaster?: boolean;
  }) => createCasterInFirestore(data),
  updateCaster: (id: string, data: Partial<Shoutcaster>) => updateCasterInFirestore(id, data),
  updateCasterBadges: (id: string, data: { isVerified?: boolean; isTopCaster?: boolean }) =>
    updateCasterBadgesInFirestore(id, data),
  updateScrimStreamLink: (scrimId: string, youtubeStreamUrl: string) =>
    updateScrimStreamLinkInFirestore(scrimId, youtubeStreamUrl),
  requestCasterWithdrawal: (
    casterId: string,
    data: {
      amount: number;
      bankOrWallet: string;
      accountNumber: string;
      accountName: string;
      note?: string;
    }
  ) => requestCasterWithdrawalInFirestore(casterId, data),
  updateWithdrawalStatus: (withdrawalId: string, status: 'PAID' | 'REJECTED') =>
    updateWithdrawalStatusInFirestore(withdrawalId, status),

  // Payments, Invoices & Validation History
  submitPayment: (
    id: string,
    data: {
      paymentMethod: PaymentMethod;
      referenceCode: string;
      proofNote?: string;
      proofImageUrl?: string;
    }
  ) => submitPaymentInFirestore(id, data),
  validatePayment: (
    id: string,
    data: {
      decision: 'APPROVE' | 'REJECT';
      referenceCode?: string;
      validationNote?: string;
      proofImageUrl?: string;
    }
  ) => validatePaymentInFirestore(id, data),
  createGatewayCheckout: (id: string, channel: GatewayChannel) =>
    createGatewayCheckoutInFirestore(id, channel),
  simulateSandboxPayment: (id: string) => simulateSandboxPaymentInFirestore(id),

  // Super Admin Data Export, Analytics & League Ops Accounts
  getAdminUsers: () => getAdminUsersInFirestore(),
  createLeagueOpsUser: (data: { displayName: string; email: string; password?: string }) =>
    createLeagueOpsUserInFirestore(data),
  resetLeagueOpsPassword: async (_id: string, _password: string) => {
    throw new Error('Akun League Ops masuk menggunakan Google OAuth.');
  },
  deleteLeagueOpsUser: (id: string) => deleteLeagueOpsUserInFirestore(id),
  resetLeagueOps2fa: async (_id: string) => {
    throw new Error('Autentikasi 2FA dikelola langsung oleh Google Account operator.');
  },
  getAuditLogs: (): Promise<{ auditLogs: AuditLogEntry[]; integrity: AuditIntegrityReport }> =>
    getAuditLogsInFirestore(),
  getAdminGameAnalytics: (game?: string): Promise<AdminGameAnalyticsResponse> =>
    getAdminGameAnalyticsFromFirestore(game),
  downloadAdminExport: (
    dataset:
      | 'all'
      | 'tournaments'
      | 'scrims'
      | 'casters'
      | 'withdrawals'
      | 'matches'
      | 'squads'
      | 'news'
      | 'users'
      | 'audit_logs',
    format: 'json' | 'csv'
  ) => downloadAdminExportFromFirestore(dataset, format),

  // Super Admin SOC Security Operations Center
  getSocOverview: () => getSocOverviewFromFirestore(),
  updateSocEventStatus: (id: string, status: SocEventStatus) =>
    updateSocEventStatusInFirestore(id, status),
  blockSocIp: (payload: { ip: string; reason: string; durationMinutes?: number | null }) =>
    blockSocIpInFirestore(payload),
  unblockSocIp: (ip: string) => unblockSocIpInFirestore(ip),
  updateSocPolicy: (patch: Partial<SocPolicy>) => updateSocPolicyInFirestore(patch),
  revokeAllOtherSocSessions: async () => ({ revokedCount: 0 }),
  runSocSelfTest: () => runSocSelfTestInFirestore(),
};
