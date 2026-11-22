import { useCallback, useEffect, useState } from 'react';
import type { Match } from '../types';

export const MATCH_NOTIFICATIONS_STORAGE_KEY = 'ordal_notified_matches';
const MATCH_NOTIFICATIONS_EVENT = 'ordal:match-notifications-updated';

function readStoredMatchIds(): string[] {
  try {
    const raw = window.localStorage.getItem(MATCH_NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

function writeStoredMatchIds(ids: string[]): void {
  try {
    window.localStorage.setItem(MATCH_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage errors in restricted environments
  }
  window.dispatchEvent(new CustomEvent(MATCH_NOTIFICATIONS_EVENT, { detail: ids }));
}

export function useMatchNotifications(onNotify?: (msg: string) => void) {
  const [notifiedIds, setNotifiedIds] = useState<string[]>(() => readStoredMatchIds());

  useEffect(() => {
    const handleSync = () => {
      setNotifiedIds(readStoredMatchIds());
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === MATCH_NOTIFICATIONS_STORAGE_KEY) {
        setNotifiedIds(readStoredMatchIds());
      }
    };
    window.addEventListener(MATCH_NOTIFICATIONS_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(MATCH_NOTIFICATIONS_EVENT, handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const isNotified = useCallback(
    (matchId: string) => notifiedIds.includes(matchId),
    [notifiedIds]
  );

  const toggleMatchNotification = useCallback(
    (match: Pick<Match, 'id' | 'teamATag' | 'teamBTag' | 'round'>) => {
      const current = readStoredMatchIds();
      const exists = current.includes(match.id);
      const next = exists
        ? current.filter((id) => id !== match.id)
        : [...current, match.id];

      writeStoredMatchIds(next);
      setNotifiedIds(next);

      if (onNotify) {
        const label = `${match.teamATag} vs ${match.teamBTag}`;
        onNotify(
          exists
            ? `Pengingat match ${label} dinonaktifkan.`
            : `Pengingat diaktifkan untuk match mendatang: ${label}.`
        );
      }

      return !exists;
    },
    [onNotify]
  );

  return {
    notifiedIds,
    isNotified,
    toggleMatchNotification,
  };
}
