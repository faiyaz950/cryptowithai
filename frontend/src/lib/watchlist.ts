/**
 * Watchlists — browser localStorage mein. Auth optional (v1).
 */

export const WATCHLISTS_KEY = "finowings.watchlists.v1";
export const WATCHLISTS_CHANGED = "finowings:watchlists-changed";

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistStore {
  lists: Watchlist[];
  activeId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function uid(): string {
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultStore(): WatchlistStore {
  const id = uid();
  const ts = nowIso();
  return {
    activeId: id,
    lists: [
      {
        id,
        name: "My Watchlist",
        symbols: ["BTCUSDT", "ETHUSDT"],
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  };
}

/** "btcinr@COINDCX-SPOT" -> "BTCINR@coindcx-spot": symbol bade akshar, venue chhote. */
export function normalizeWatchKey(key: string): string {
  const raw = key.trim().replace(/\s+/g, "");
  const at = raw.indexOf("@");
  if (at < 0) return raw.toUpperCase().replace("/", "");
  return `${raw.slice(0, at).toUpperCase().replace("/", "")}@${raw.slice(at + 1).toLowerCase()}`;
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WATCHLISTS_CHANGED));
}

export function loadWatchlistStore(): WatchlistStore {
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = localStorage.getItem(WATCHLISTS_KEY);
    if (!raw) {
      const store = defaultStore();
      localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(store));
      return store;
    }
    const parsed = JSON.parse(raw) as WatchlistStore;
    if (!parsed?.lists?.length) {
      const store = defaultStore();
      localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(store));
      return store;
    }
    parsed.lists = parsed.lists.map((l) => ({ ...l, symbols: [...new Set(l.symbols.map(normalizeWatchKey))] }));
    if (!parsed.lists.some((l) => l.id === parsed.activeId)) {
      parsed.activeId = parsed.lists[0].id;
    }
    return parsed;
  } catch {
    return defaultStore();
  }
}

function saveStore(store: WatchlistStore): WatchlistStore {
  if (typeof window !== "undefined") {
    localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(store));
    emitChange();
  }
  return store;
}

export function listWatchlists(): Watchlist[] {
  return loadWatchlistStore().lists;
}

export function getActiveWatchlist(): Watchlist {
  const store = loadWatchlistStore();
  return store.lists.find((l) => l.id === store.activeId) ?? store.lists[0];
}

export function setActiveWatchlist(id: string): WatchlistStore {
  const store = loadWatchlistStore();
  if (!store.lists.some((l) => l.id === id)) return store;
  return saveStore({ ...store, activeId: id });
}

export function createWatchlist(name: string): Watchlist {
  const store = loadWatchlistStore();
  const ts = nowIso();
  const list: Watchlist = {
    id: uid(),
    name: name.trim() || "New Watchlist",
    symbols: [],
    createdAt: ts,
    updatedAt: ts,
  };
  saveStore({
    activeId: list.id,
    lists: [...store.lists, list],
  });
  return list;
}

export function renameWatchlist(id: string, name: string): void {
  const store = loadWatchlistStore();
  const trimmed = name.trim();
  if (!trimmed) return;
  saveStore({
    ...store,
    lists: store.lists.map((l) =>
      l.id === id ? { ...l, name: trimmed, updatedAt: nowIso() } : l,
    ),
  });
}

export function deleteWatchlist(id: string): void {
  const store = loadWatchlistStore();
  if (store.lists.length <= 1) return;
  const lists = store.lists.filter((l) => l.id !== id);
  const activeId = store.activeId === id ? lists[0].id : store.activeId;
  saveStore({ lists, activeId });
}

export function addSymbolToWatchlist(listId: string, symbol: string): { ok: boolean; error?: string } {
  const store = loadWatchlistStore();
  const list = store.lists.find((l) => l.id === listId);
  if (!list) return { ok: false, error: "Watchlist nahi mili" };
  const sym = normalizeWatchKey(symbol);
  if (!sym) return { ok: false, error: "Symbol chahiye" };
  if (list.symbols.includes(sym)) {
    return { ok: false, error: `"${sym}" is list mein pehle se hai` };
  }
  saveStore({
    ...store,
    lists: store.lists.map((l) =>
      l.id === listId
        ? { ...l, symbols: [...l.symbols, sym], updatedAt: nowIso() }
        : l,
    ),
  });
  return { ok: true };
}

/** Ek saath kai pairs — pehle se maujood chhod deta hai, kitne naye jude wo batata hai. */
export function addSymbolsToWatchlist(listId: string, symbols: string[]): { added: number } {
  const store = loadWatchlistStore();
  const list = store.lists.find((l) => l.id === listId);
  if (!list) return { added: 0 };
  const have = new Set(list.symbols);
  const fresh = [...new Set(symbols.map(normalizeWatchKey).filter(Boolean))].filter((k) => !have.has(k));
  if (!fresh.length) return { added: 0 };
  saveStore({
    ...store,
    lists: store.lists.map((l) =>
      l.id === listId ? { ...l, symbols: [...l.symbols, ...fresh], updatedAt: nowIso() } : l,
    ),
  });
  return { added: fresh.length };
}

export function removeSymbolFromWatchlist(listId: string, symbol: string): void {
  const store = loadWatchlistStore();
  saveStore({
    ...store,
    lists: store.lists.map((l) =>
      l.id === listId
        ? {
            ...l,
            symbols: l.symbols.filter((s) => s !== symbol),
            updatedAt: nowIso(),
          }
        : l,
    ),
  });
}
