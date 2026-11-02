"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { POOLS, RARITY_WORD, SLOT_ORDER } from "../lib/content";
import { cn } from "../lib/format";
import { useVault } from "../lib/storage";
import type { Card, Pool, Rarity } from "../lib/types";
import { Button } from "./Button";
import { CardSkeleton, CardView } from "./CardView";
import { useCatalog } from "./CatalogProvider";
import { StatusBlock } from "./Shell";

const RARITIES: Rarity[] = ["C", "R", "SR", "SSR", "UR"];

export function DexBrowser() {
  const { data, loading, error, reload } = useCatalog();
  const vault = useVault();
  const [pool, setPool] = useState<Pool | "all">("all");
  const [rarity, setRarity] = useState<Rarity | "all">("all");
  const [year, setYear] = useState<number | "all">("all");
  const owned = useMemo(() => new Set(vault?.owned ?? []), [vault]);

  const years = useMemo(() => {
    const set = new Set<number>();
    data?.cards.forEach((card) => {
      if (card.year) set.add(card.year);
    });
    return Array.from(set).sort();
  }, [data]);

  const visible = useMemo(() => {
    return (data?.cards ?? []).filter((card) => {
      if (pool !== "all" && card.pool !== pool) return false;
      if (rarity !== "all" && card.rarity !== rarity) return false;
      if (year !== "all" && card.year !== year) return false;
      return true;
    });
  }, [data, pool, rarity, year]);

  const have = visible.filter((card) => owned.has(card.card_id)).length;
  const badges = useMemo(() => badgeSets(data?.cards ?? [], owned), [data, owned]);

  if (error) {
    return <StatusBlock title="Dex didn't open" body="The catalog file missed this page." action={<Button onClick={reload}>Try again</Button>} />;
  }

  return (
    <div>
      <p className="kicker">Collection</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Dex</h1>
      <p className="lede mt-4">
        Unowned cards stay silhouettes: year, pool, and rarity, not the title. A small set of three to eight cards in the same year, pool, and rarity earns a badge.
      </p>
      <p className="mt-4 font-mono text-xs text-phosphor">
        {data ? `${owned.size} of ${data.card_count} owned · showing ${have} of ${visible.length}` : "Counting the shelves…"}
      </p>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        <FilterChip on={pool === "all"} onClick={() => setPool("all")}>All pools</FilterChip>
        {SLOT_ORDER.map((item) => (
          <FilterChip key={item} on={pool === item} onClick={() => setPool(item)}>{POOLS[item].label}</FilterChip>
        ))}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
        <FilterChip on={rarity === "all"} onClick={() => setRarity("all")}>All rarities</FilterChip>
        {RARITIES.map((item) => (
          <FilterChip key={item} on={rarity === item} onClick={() => setRarity(item)}>{item} {RARITY_WORD[item]}</FilterChip>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-3 text-sm text-mute">
        Year
        <select className="field max-w-[160px]" value={year === "all" ? "all" : String(year)} onChange={(event) => setYear(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All years</option>
          {years.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>

      {badges.length > 0 ? (
        <ul className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {badges.map((badge) => (
            <li key={badge.key} className={cn("min-w-[140px] rounded-2xl border px-3 py-3", badge.done ? "border-phosphor bg-phosphor text-[#14160f]" : "border-white/10 text-mute")}>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em]">{badge.done ? "Badge" : `${badge.have}/${badge.total}`}</p>
              <p className="mt-1 font-serif text-lg leading-tight">{badge.label}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {loading && !data ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 8 }, (_, index) => <CardSkeleton key={index} />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-10 text-mute">No cards in this slice. Widen a filter.</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((card) => {
            const known = owned.has(card.card_id);
            return (
              <li key={card.card_id}>
                {known ? (
                  <Link href={`/card/${card.card_id}`} className="card-link">
                    <CardView card={card} />
                  </Link>
                ) : (
                  <CardView card={card} mode="shadow" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cn("chip", on && "is-on")} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

function badgeSets(cards: Card[], owned: Set<string>) {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = `${card.year}|${card.pool}|${card.rarity}`;
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length >= 3 && list.length <= 8)
    .map(([key, list]) => {
      const [year, pool, rarity] = key.split("|");
      const have = list.filter((card) => owned.has(card.card_id)).length;
      return {
        key,
        label: `${year} ${POOLS[pool as Pool].label} ${rarity}`,
        have,
        total: list.length,
        done: have === list.length,
      };
    })
    .sort((a, b) => Number(b.done) - Number(a.done) || b.have / b.total - a.have / a.total)
    .slice(0, 8);
}
