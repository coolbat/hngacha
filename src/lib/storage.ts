"use client";

import { useEffect, useState } from "react";
import { DAILY_PACKS } from "./content";
import { drawPack, personalSeed } from "./packs";
import type { Card } from "./types";

const KEY = "hackerpacks.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Inflight {
  mode: "personal";
  day: string;
  index: number;
  cardIds: string[];
  flipped: boolean[];
}

export interface Vault {
  v: 1;
  salt: string;
  days: Record<string, { opened: number }>;
  seen: { id: string; t: number }[];
  owned: string[];
  saved: string[];
  later: string[];
  inflight: Inflight | null;
  lastPack: { day: string; index: number; cardIds: string[]; mode: "personal" | "global" } | null;
  globalSavedDay: string;
}

const listeners = new Set<() => void>();

function makeSalt(): string {
  return `${Math.floor(Math.random() * 1e9).toString(36)}${Date.now().toString(36)}`;
}

export function emptyVault(): Vault {
  return {
    v: 1,
    salt: "",
    days: {},
    seen: [],
    owned: [],
    saved: [],
    later: [],
    inflight: null,
    lastPack: null,
    globalSavedDay: "",
  };
}

function prune(vault: Vault): Vault {
  const cutoff = Date.now() - 30 * DAY_MS;
  return {
    ...vault,
    seen: vault.seen.filter((entry) => entry.t >= cutoff).slice(-5000),
    owned: Array.from(new Set(vault.owned)),
    saved: Array.from(new Set(vault.saved)),
    later: Array.from(new Set(vault.later)),
  };
}

export function readVault(): Vault {
  if (typeof window === "undefined") return emptyVault();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const fresh = { ...emptyVault(), salt: makeSalt() };
      window.localStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<Vault>;
    if (parsed.v !== 1 || !parsed.salt) {
      const fresh = { ...emptyVault(), salt: parsed.salt || makeSalt() };
      window.localStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
    }
    return prune({ ...emptyVault(), ...parsed, v: 1, salt: parsed.salt });
  } catch {
    return { ...emptyVault(), salt: makeSalt() };
  }
}

export function writeVault(vault: Vault): void {
  window.localStorage.setItem(KEY, JSON.stringify(prune(vault)));
  listeners.forEach((listener) => listener());
}

export function useVault(): Vault | null {
  const [vault, setVault] = useState<Vault | null>(null);
  useEffect(() => {
    setVault(readVault());
    const sync = () => setVault(readVault());
    listeners.add(sync);
    window.addEventListener("storage", sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return vault;
}

export function packsLeft(vault: Vault, day: string): number {
  const opened = vault.days[day]?.opened ?? 0;
  return Math.max(0, DAILY_PACKS - opened);
}

export function avoidance(vault: Vault, totalCards: number): Set<string> {
  if (new Set(vault.owned).size >= totalCards) return new Set();
  return new Set(vault.seen.map((entry) => entry.id));
}

export function dealPersonal(
  cards: Card[],
  day: string,
): { pack: Card[]; vault: Vault; resumed: boolean } | { error: "empty" } {
  const vault = readVault();
  if (vault.inflight) {
    return { pack: [], vault, resumed: true };
  }
  if (packsLeft(vault, day) <= 0) return { error: "empty" };
  const opened = vault.days[day]?.opened ?? 0;
  const pack = drawPack(cards, personalSeed(vault.salt, day, opened), avoidance(vault, cards.length));
  const now = Date.now();
  const next: Vault = {
    ...vault,
    days: { ...vault.days, [day]: { opened: opened + 1 } },
    inflight: {
      mode: "personal",
      day,
      index: opened,
      cardIds: pack.map((card) => card.card_id),
      flipped: [false, false, false, false, false],
    },
    seen: [...vault.seen, ...pack.map((card) => ({ id: card.card_id, t: now }))],
  };
  writeVault(next);
  return { pack, vault: next, resumed: false };
}

export function markFlip(index: number, cardId: string): Vault {
  const vault = readVault();
  if (!vault.inflight) return vault;
  const flipped = vault.inflight.flipped.slice();
  flipped[index] = true;
  const owned = vault.owned.includes(cardId) ? vault.owned : [...vault.owned, cardId];
  const done = flipped.every(Boolean);
  const next: Vault = {
    ...vault,
    owned,
    inflight: done ? null : { ...vault.inflight, flipped },
    lastPack: done
      ? { day: vault.inflight.day, index: vault.inflight.index, cardIds: vault.inflight.cardIds, mode: "personal" }
      : vault.lastPack,
  };
  writeVault(next);
  return next;
}

export function ownCards(ids: string[]): Vault {
  const vault = readVault();
  const owned = Array.from(new Set([...vault.owned, ...ids]));
  if (owned.length === vault.owned.length) return vault;
  const next = { ...vault, owned };
  writeVault(next);
  return next;
}

export function rememberGlobal(cardIds: string[], day: string): Vault {
  const vault = readVault();
  const owned = Array.from(new Set([...vault.owned, ...cardIds]));
  const next: Vault = {
    ...vault,
    owned,
    globalSavedDay: day,
    lastPack: { day, index: -1, cardIds, mode: "global" },
  };
  writeVault(next);
  return next;
}

export function toggleList(list: "saved" | "later", cardId: string): Vault {
  const vault = readVault();
  const current = new Set(vault[list]);
  if (current.has(cardId)) current.delete(cardId);
  else current.add(cardId);
  const next = { ...vault, [list]: Array.from(current) };
  writeVault(next);
  return next;
}

export function abandonInflight(): void {
  const vault = readVault();
  if (!vault.inflight) return;
  const day = vault.inflight.day;
  const opened = vault.days[day]?.opened ?? 0;
  writeVault({
    ...vault,
    inflight: null,
    days: { ...vault.days, [day]: { opened: Math.max(0, opened - 1) } },
  });
}
