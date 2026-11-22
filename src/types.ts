export type GameTitle = 'POINT BLANK' | 'FREE FIRE' | 'EFOOTBALL';
export type TournamentFormat = 'SINGLE ELIMINATION' | 'DOUBLE ELIMINATION';
export type TournamentStatus = 'OPEN' | 'ONGOING' | 'COMPLETED';

export interface Tournament {
  id: string;
  name: string;
  game: GameTitle;
  format: TournamentFormat;
  prizePool: string;
  maxTeams: number;
  registeredTeams: number;
  startDate: string;
  region: string;
  status: TournamentStatus;
  description: string;
  organizer?: string;
  registrationFee?: string;
  mode?: string;
  checkInInfo?: string;
  prizeFirst?: string;
  prizeSecond?: string;
  prizeThird?: string;
  prizeMvp?: string;
  rules?: string;
  liveStreamUrl?: string;
  replayStreamUrl?: string;
}

export type MatchStatus = 'UPCOMING' | 'LIVE' | 'FINISHED';
export type BracketRound = 'QUARTERFINAL' | 'SEMIFINAL' | 'GRAND FINAL';

export interface Match {
  id: string;
  tournamentId: string;
  game: GameTitle;
  round: BracketRound;
  bracketOrder: number;
  teamA: string;
  teamATag: string;
  teamB: string;
  teamBTag: string;
  scoreA: number;
  scoreB: number;
  mapName: string;
  status: MatchStatus;
  winnerTag?: string;
  nextMatchId?: string;
  nextMatchSlot?: 'A' | 'B';
  mvpIgn?: string;
  updatedAt: string;
}

export type CheckInStatus = 'CHECKED IN' | 'PENDING' | 'DISQUALIFIED';

export interface Squad {
  id: string;
  name: string;
  tag: string;
  tournamentId: string;
  captainIgn: string;
  captainContact: string;
  roster: string[];
  seed: number;
  checkInStatus: CheckInStatus;
  registeredAt: string;
  ownerUid?: string;
}

export type NewsCategory = 'META UPDATE' | 'ROSTER LEAKS' | 'TOURNAMENT RECAP' | 'PATCH NOTES';

export interface NewsArticle {
  id: string;
  title: string;
  category: NewsCategory;
  author: string;
  publishedAt: string;
  readTime: string;
  excerpt: string;
  content: string;
  accentTone: 'cyan' | 'crimson' | 'lime';
  thumbnailUrl?: string;
}

export type ScrimGame = 'POINT BLANK' | 'FREE FIRE' | 'EFOOTBALL';

export type ScrimMode = 'OPEN_LOBBY' | 'DIRECT_CHALLENGE';

export type ScrimStatus =
  | 'OPEN_LOBBY'
  | 'WAITING_APPROVAL'
  | 'AWAITING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'CONFIRMED'
  | 'CANCELLED';

export type CasterApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';

export interface Shoutcaster {
  id: string;
  name: string;
  alias: string;
  specialtyGames: ScrimGame[];
  rateCard: number;
  maxMatchesPerDay: number;
  dayOffDates: string[];
  dayOffSlots?: Record<string, string[]>;
  bio: string;
  status: 'ACTIVE' | 'INACTIVE';
  isVerified?: boolean;
  isTopCaster?: boolean;
  ownerUid?: string;
}

export interface ScrimRescheduleProposal {
  proposedDate: string;
  proposedTimeSlot: string;
  reason?: string;
  proposedBy: string;
  proposedAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
}

export interface ScrimRefundRequest {
  id: string;
  teamName: string;
  side: 'host' | 'challenger';
  amount: number;
  bankOrWallet: string;
  accountNumber: string;
  accountName: string;
  reason?: string;
  status: 'REQUESTED' | 'REFUNDED';
  requestedByUid?: string;
  requestedByEmail: string;
  requestedAt: string;
}

export interface ScrimChallengerApplication {
  id: string;
  teamName: string;
  teamLogo: string;
  rosterCore: string[];
  rosterSub: string[];
  applicantUserId: string;
  applicantEmail: string;
  note?: string;
  status: 'PENDING' | 'SELECTED' | 'REJECTED';
  appliedAt: string;
}

export interface ScrimSession {
  id: string;
  game: ScrimGame;
  date: string;
  timeSlot: string;
  mode: ScrimMode;
  status: ScrimStatus;
  casterId: string;
  casterName: string;
  casterRate: number;
  casterApprovalStatus: CasterApprovalStatus;
  platformFee: number;
  totalCost: number;
  splitCostPerTeam: number;
  hostUserId?: string;
  hostUserEmail?: string;
  hostTeamName: string;
  hostTeamLogo: string;
  hostRosterCore: string[];
  hostRosterSub: string[];
  challengerUserId?: string;
  challengerUserEmail?: string;
  challengerTeamName: string;
  challengerTeamLogo: string;
  challengerRosterCore: string[];
  challengerRosterSub: string[];
  challengerApplications?: ScrimChallengerApplication[];
  hostPaid: boolean;
  challengerPaid: boolean;
  paymentDeadlineAt?: string;
  hostScore?: number;
  challengerScore?: number;
  winnerSide?: 'host' | 'challenger' | 'draw';
  resultRecorded?: boolean;
  youtubeStreamUrl?: string;
  rescheduleProposal?: ScrimRescheduleProposal;
  refundRequests?: ScrimRefundRequest[];
  createdAt: string;
}

export type WithdrawalStatus = 'PENDING' | 'PAID' | 'REJECTED';

export interface CasterWithdrawal {
  id: string;
  casterId: string;
  casterUid?: string;
  casterName: string;
  amount: number;
  bankOrWallet: string;
  accountNumber: string;
  accountName: string;
  note?: string;
  status: WithdrawalStatus;
  requestedAt: string;
  processedAt?: string;
}

export type PaymentCategory = 'SCRIM_SPLIT_BILL' | 'CASTER_PAYOUT' | 'SCRIM_REFUND';
export type PaymentValidationStatus =
  | 'UNPAID'
  | 'PENDING_VALIDATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';
export type PaymentMethod =
  | 'QRIS'
  | 'VA_BCA'
  | 'VA_MANDIRI'
  | 'VA_BNI'
  | 'VA_BRI'
  | 'TRANSFER_BCA'
  | 'TRANSFER_MANDIRI'
  | 'TRANSFER_BNI'
  | 'TRANSFER_BRI'
  | 'GOPAY'
  | 'OVO'
  | 'DANA'
  | 'SHOPEEPAY'
  | 'INTERNAL_ADMIN';

export type GatewayProvider = 'ORDAL_SANDBOX_PG' | 'MIDTRANS_SNAP' | 'XENDIT_BI_SNAP';
export type GatewayChannel = 'QRIS_DINAMIS' | 'VA_BCA' | 'VA_MANDIRI' | 'VA_BNI' | 'VA_BRI';

export interface PaymentLineItem {
  label: string;
  amount: number;
}

export interface PaymentHistoryEvent {
  id: string;
  timestamp: string;
  action:
    | 'INVOICE_ISSUED'
    | 'GATEWAY_CREATED'
    | 'PAYMENT_SUBMITTED'
    | 'PAYMENT_VALIDATED'
    | 'GATEWAY_SETTLED'
    | 'PAYMENT_REJECTED'
    | 'PAYMENT_EXPIRED'
    | 'AUTO_REFUND_ISSUED'
    | 'PAYOUT_REQUESTED'
    | 'REFUND_REQUESTED';
  actorName: string;
  actorRole: UserRole | 'SYSTEM';
  note?: string;
}

export interface PaymentRecord {
  id: string;
  invoiceNumber: string;
  category: PaymentCategory;
  status: PaymentValidationStatus;
  ownerUid?: string;
  casterUid?: string;
  scrimId?: string;
  scrimSide?: 'host' | 'challenger';
  withdrawalId?: string;
  refundId?: string;
  casterId?: string;
  game?: ScrimGame;
  title: string;
  payerName: string;
  payerEmail?: string;
  receiverName: string;
  amount: number;
  baseAmount?: number;
  gatewayFee?: number;
  casterFeeShare?: number;
  platformFeeShare?: number;
  lineItems: PaymentLineItem[];
  paymentMethod?: PaymentMethod;
  gatewayProvider?: GatewayProvider;
  gatewayChannel?: GatewayChannel;
  gatewayOrderId?: string;
  vaNumber?: string;
  qrPayload?: string;
  gatewayExpiresAt?: string;
  idempotencyKey?: string;
  referenceCode?: string;
  bankOrWallet?: string;
  accountNumber?: string;
  accountName?: string;
  proofNote?: string;
  proofImageUrl?: string;
  issuedAt: string;
  dueAt?: string;
  submittedAt?: string;
  validatedAt?: string;
  validatedBy?: string;
  validationNote?: string;
  history: PaymentHistoryEvent[];
}

export type SettlementLedgerBucket =
  | 'ESCROW_TEAM'
  | 'CASTER_PAYABLE'
  | 'PLATFORM_REVENUE'
  | 'PG_FEE_EXPENSE'
  | 'REFUND_PAYABLE';

export interface SettlementLedgerEntry {
  id: string;
  timestamp: string;
  paymentId: string;
  invoiceNumber: string;
  accountBucket: SettlementLedgerBucket;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  actorEmail?: string;
  scrimId?: string;
  casterId?: string;
}

export type UserRole = 'TEAM' | 'CASTER' | 'LEAGUE_OPS' | 'SUPER_ADMIN';

export interface TeamProfile {
  teamName: string;
  teamTag: string;
  teamLogo: string;
  primaryGame: ScrimGame;
  captainIgn: string;
  captainContact: string;
  rosterCore: string[];
  rosterSub: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  casterId?: string;
  inviteId?: string;
  teamProfile?: TeamProfile;
  createdAt?: string;
  totpEnabled?: boolean;
  recoveryCodesRemaining?: number;
}

export interface AuthLoginSuccess {
  mfaRequired?: false;
  user: AuthUser;
  csrfToken: string;
  idleTimeoutMs?: number;
}

export interface AuthLoginMfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export type AuthLoginResponse = AuthLoginSuccess | AuthLoginMfaChallenge;

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
  issuer: string;
  accountName: string;
}

export interface HeroSettings {
  eyebrowPrimary: string;
  eyebrowSecondary: string;
  headline: string;
  subtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  featuredTournamentId: string;
  backgroundImageUrl?: string;
  updatedAt?: string;
}

export interface BrandSettings {
  wordmarkUrl: string;
  monogramUrl: string;
  faviconUrl: string;
  brandName?: string;
  updatedAt?: string;
}

export type AuditResource =
  | 'TOURNAMENT'
  | 'MATCH'
  | 'SQUAD'
  | 'HERO'
  | 'BRAND'
  | 'PAYMENT'
  | 'CASTER'
  | 'USER';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'GENERATE_BRACKET';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorEmail: string;
  actorName: string;
  resource: AuditResource;
  action: AuditAction;
  targetId: string;
  targetLabel: string;
  summary: string;
  changedFields?: string[];
  prevHash?: string;
  entryHash?: string;
}

export interface AuditIntegrityReport {
  totalLogs: number;
  hashedLogs: number;
  valid: boolean;
  brokenAtId?: string;
}

export interface ScrimSettings {
  defaultLobbyFee: number;
  lobbyFeeByGame?: Partial<Record<ScrimGame, number>>;
  updatedAt: string;
}

export interface OrdalDatabase {
  tournaments: Tournament[];
  matches: Match[];
  squads: Squad[];
  news: NewsArticle[];
  scrims: ScrimSession[];
  casters: Shoutcaster[];
  withdrawals: CasterWithdrawal[];
  payments?: PaymentRecord[];
  ledger?: SettlementLedgerEntry[];
  heroSettings?: HeroSettings;
  brandSettings?: BrandSettings;
  scrimSettings?: ScrimSettings;
  auditLogs?: AuditLogEntry[];
}

export interface GameAnalyticsRow {
  game: string;
  tournamentsCount: number;
  squadsCount: number;
  tournamentMatchesCount: number;
  liveMatchesCount: number;
  scrimsCount: number;
  confirmedScrimsCount: number;
  cancelledScrimsCount: number;
  scrimCompletionRate: number;
  totalPrizePool: number;
  lobbyFeeIncome: number;
  casterFeeVolume: number;
  tournamentFeeIncome: number;
  netOrdalIncome: number;
  grossIncome: number;
  refundedCount: number;
  refundedAmount: number;
}

export interface AdminGameAnalyticsResponse {
  selectedGame: string;
  availableGames: string[];
  summary: Omit<GameAnalyticsRow, 'game'>;
  byGame: GameAnalyticsRow[];
}

export type SocSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SocEventStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type SocCategory =
  | 'WAF_BLOCK'
  | 'BRUTE_FORCE'
  | 'AUTH_FAILURE'
  | 'RBAC_VIOLATION'
  | 'RATE_LIMIT'
  | 'IP_BLOCKED'
  | 'POLICY_CHANGE'
  | 'SESSION_REVOKED'
  | 'SESSION_HIJACK';

export interface SocEvent {
  id: string;
  timestamp: string;
  severity: SocSeverity;
  category: SocCategory;
  ip: string;
  method: string;
  path: string;
  actorEmail?: string;
  actorRole?: UserRole;
  userAgent?: string;
  summary: string;
  details?: string;
  status: SocEventStatus;
}

export interface SocBlockedIp {
  ip: string;
  reason: string;
  blockedAt: string;
  expiresAt: string | null;
  blockedBy: string;
  autoBlocked: boolean;
  hits: number;
}

export interface SocPolicy {
  wafEnabled: boolean;
  autoBlockEnabled: boolean;
  bruteForceThreshold: number;
  autoBlockDurationMinutes: number;
  strictApiHeaders: boolean;
  alertOnRbacViolation: boolean;
}

export interface SocActiveSession {
  tokenPrefix: string;
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  expiresAt: string;
  isCurrent: boolean;
}

export type ProductionCheckStatus = 'READY' | 'OPTIONAL' | 'ACTION_REQUIRED';

export interface ProductionSecurityCheck {
  id: string;
  label: string;
  status: ProductionCheckStatus;
  detail: string;
  envVar?: string;
}

export interface SocOverviewResponse {
  threatLevel: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
  securityScore: number;
  summary: {
    totalEvents: number;
    openAlerts: number;
    criticalOpen: number;
    highOpen: number;
    eventsLast24h: number;
    blockedIpsCount: number;
    activeSessionsCount: number;
    wafBlocksTotal: number;
  };
  categoryBreakdown: { category: SocCategory; count: number }[];
  policy: SocPolicy;
  blockedIps: SocBlockedIp[];
  events: SocEvent[];
  activeSessions: SocActiveSession[];
  productionChecklist?: ProductionSecurityCheck[];
  auditIntegrity?: AuditIntegrityReport;
}

