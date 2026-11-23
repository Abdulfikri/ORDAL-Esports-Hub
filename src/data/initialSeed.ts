import type { OrdalDatabase } from '../types';

/**
 * Initial data written to Cloud Firestore the first time an admin signs in
 * (see `seedFirestoreIfEmpty`), and shown as the public read-only catalog
 * before seeding has happened.
 *
 * Collections start empty so the platform launches with a clean slate;
 * tournaments, squads, news, etc. are created from the admin dashboard.
 */
export const INITIAL_ORDAL_SEED: OrdalDatabase = {
  tournaments: [],
  matches: [],
  squads: [],
  news: [],
  scrims: [],
  casters: [],
  withdrawals: [],
  payments: [],
  ledger: [],
  auditLogs: [],
  heroSettings: {
    eyebrowPrimary: 'ORDAL COMPETITIVE ESPORTS HUB',
    eyebrowSecondary: 'POINT BLANK · FREE FIRE · EFOOTBALL',
    headline: '',
    subtitle: '',
    primaryCtaLabel: 'Register Squad',
    secondaryCtaLabel: 'Lihat Turnamen',
    secondaryCtaHref: '#turnamen',
    featuredTournamentId: '',
    backgroundImageUrl: '',
  },
  brandSettings: {
    wordmarkUrl: '',
    monogramUrl: '',
    faviconUrl: '',
    brandName: 'ORDAL Esports Hub',
  },
  scrimSettings: {
    defaultLobbyFee: 50000,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};
