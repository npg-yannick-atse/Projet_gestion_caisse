import { create } from 'zustand';

/**
 * Notification — clé unique par notification.
 * Convention : `<type>:<id>` (ex. `bon-cree:42`, `extension:13`).
 * Comme ça on peut ajouter d'autres types plus tard sans collision.
 */
type NotifKey = string;

const STORAGE_KEY = 'fdc.notifications.read';

interface NotifState {
  read: Set<NotifKey>;
  markRead: (key: NotifKey) => void;
  markAllRead: (keys: NotifKey[]) => void;
  isUnread: (key: NotifKey) => boolean;
  clear: () => void;
}

function load(): Set<NotifKey> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

function persist(set: Set<NotifKey>) {
  if (typeof window === 'undefined') return;
  // Borne la taille pour éviter une croissance illimitée (on garde 500 plus récentes).
  const arr = Array.from(set);
  const capped = arr.length > 500 ? arr.slice(-500) : arr;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
}

export const useNotificationsStore = create<NotifState>((set, get) => ({
  read: load(),
  markRead: (key) => {
    const next = new Set(get().read);
    next.add(key);
    persist(next);
    set({ read: next });
  },
  markAllRead: (keys) => {
    const next = new Set(get().read);
    keys.forEach((k) => next.add(k));
    persist(next);
    set({ read: next });
  },
  isUnread: (key) => !get().read.has(key),
  clear: () => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    set({ read: new Set() });
  },
}));

/** Helper pour générer la clé d'une notification "bon à valider". */
export function bonNotifKey(bonId: string): NotifKey {
  return `bon-cree:${bonId}`;
}

/** Helper pour générer la clé d'une notification "demande de recharge à traiter". */
export function rechargeNotifKey(id: string): NotifKey {
  return `recharge:${id}`;
}

/**
 * Helper pour la clé d'une notification "demande de transfert".
 * On inclut le statut : un transfert CREE (à approuver) puis APPROUVEE (à exécuter)
 * génèrent deux notifications distinctes.
 */
export function transfertNotifKey(id: string, statut: string): NotifKey {
  return `transfert:${statut}:${id}`;
}
