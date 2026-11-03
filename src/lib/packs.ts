import { SLOT_ORDER } from "./content";
import { hashString, mulberry32, type Rng } from "./rng";
import type { Card, Pool, Rarity, SubPool } from "./types";

export const RARITY_RANK: Record<Rarity, number> = { C: 0, R: 1, SR: 2, SSR: 3, UR: 4 };

const RATE: Array<[Rarity, number]> = [
  ["UR", 0.01],
  ["SSR", 0.04],
  ["SR", 0.12],
  ["R", 0.28],
  ["C", 0.55],
];

const WILD: Array<[SubPool, number]> = [
  ["classic", 0.4],
  ["oss", 0.2],
  ["paper", 0.15],
  ["timemachine", 0.15],
  ["poll", 0.1],
];

export function globalSeed(day: string): string {
  return `hackerpacks-global-v1|${day}`;
}

export function personalSeed(salt: string, day: string, index: number): string {
  return `hackerpacks-personal-v1|${salt}|${day}|${index}`;
}

function rollWeighted<T>(rng: Rng, table: Array<[T, number]>): T {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng() * total;
  for (const [value, weight] of table) {
    cursor -= weight;
    if (cursor < 0) return value;
  }
  return table[table.length - 1][0];
}

export function rollRarity(rng: Rng, noCommon = false): Rarity {
  const table = noCommon ? RATE.filter(([rarity]) => rarity !== "C") : RATE;
  return rollWeighted(rng, table);
}

function pick(rng: Rng, list: Card[]): Card | null {
  if (!list.length) return null;
  const index = Math.floor(rng() * list.length);
  return list[index] ?? null;
}

function candidates(
  cards: Card[],
  pool: Pool,
  sub: SubPool | null,
  rarity: Rarity | null,
  used: Set<string>,
  avoid: Set<string>,
): Card[] {
  return cards.filter(
    (card) =>
      card.pool === pool &&
      (sub == null || card.sub_pool === sub) &&
      (rarity == null || card.rarity === rarity) &&
      !used.has(card.card_id) &&
      !avoid.has(card.card_id),
  );
}

function take(
  rng: Rng,
  cards: Card[],
  pool: Pool,
  sub: SubPool | null,
  rarity: Rarity | null,
  used: Set<string>,
  avoid: Set<string>,
): Card | null {
  return (
    pick(rng, candidates(cards, pool, sub, rarity, used, avoid)) ??
    (avoid.size ? pick(rng, candidates(cards, pool, sub, rarity, used, new Set())) : null)
  );
}

function rollWild(rng: Rng, cards: Card[]): SubPool | null {
  const present = new Set(
    cards.filter((card) => card.pool === "wild" && card.sub_pool).map((card) => card.sub_pool as SubPool),
  );
  const table = WILD.filter(([sub]) => present.has(sub));
  if (!table.length) return null;
  return rollWeighted(rng, table);
}

function takeAnyRare(rng: Rng, cards: Card[], used: Set<string>): Card | null {
  const list = cards.filter((card) => RARITY_RANK[card.rarity] >= 1 && !used.has(card.card_id));
  return pick(rng, list);
}

/** Five fixed slots, pity of at least one Rare, deterministic for a seed. */
export function drawPack(cards: Card[], seed: string, avoid: Set<string>): Card[] {
  const rng = mulberry32(hashString(seed));
  const chosen: Card[] = [];
  const used = new Set<string>();

  for (const pool of SLOT_ORDER) {
    const sub = pool === "wild" ? rollWild(rng, cards) : null;
    const rarity = rollRarity(rng);
    const card =
      take(rng, cards, pool, sub, rarity, used, avoid) ??
      take(rng, cards, pool, sub, null, used, avoid) ??
      take(rng, cards, pool, null, null, used, avoid);
    if (!card) {
      throw new Error(`Could not fill the ${pool} slot.`);
    }
    chosen.push(card);
    used.add(card.card_id);
  }

  if (!chosen.some((card) => RARITY_RANK[card.rarity] >= 1)) {
    const usedWithoutWild = new Set(chosen.slice(0, 4).map((card) => card.card_id));
    let replacement: Card | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const sub = rollWild(rng, cards);
      const rarity = rollRarity(rng, true);
      replacement =
        take(rng, cards, "wild", sub, rarity, usedWithoutWild, avoid) ??
        take(rng, cards, "wild", null, rarity, usedWithoutWild, avoid);
      if (replacement && RARITY_RANK[replacement.rarity] >= 1) break;
      replacement = null;
    }
    replacement = replacement ?? takeAnyRare(rng, cards, usedWithoutWild);
    if (replacement) chosen[4] = replacement;
  }

  return chosen;
}

export function bestCard(cards: Card[]): Card | null {
  if (!cards.length) return null;
  return [...cards].sort(
    (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.heat_score - a.heat_score,
  )[0];
}

export function resolveCards(cards: Card[], ids: string[]): Card[] | null {
  const map = new Map(cards.map((card) => [card.card_id, card]));
  const pack: Card[] = [];
  for (const id of ids) {
    const card = map.get(id);
    if (!card) return null;
    pack.push(card);
  }
  return pack;
}
