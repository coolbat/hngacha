import { drawPack, globalSeed, personalSeed, RARITY_RANK } from "../src/lib/packs";
import type { Card, Pool, Rarity, SubPool } from "../src/lib/types";

const pools: Pool[] = ["book", "video", "showhn", "comment", "wild"];
const subs: SubPool[] = ["classic", "oss", "paper", "timemachine", "poll"];

function rarityFor(index: number): Rarity {
  if (index < 55) return "C";
  if (index < 83) return "R";
  if (index < 95) return "SR";
  if (index < 99) return "SSR";
  return "UR";
}

function fakeCard(pool: Pool, index: number): Card {
  const sub = pool === "wild" ? subs[index % subs.length] : null;
  return {
    card_id: `${pool}_${index}`,
    pool,
    sub_pool: sub,
    title: `${pool} ${index}`,
    subtitle: "test",
    image_url: null,
    hn_item_ids: [index],
    primary_hn_id: index,
    external_url: "",
    heat_score: index,
    mentions: 1,
    rarity: rarityFor(index),
    tags: [],
    first_seen: "2014-04-01",
    last_seen: "2014-04-01",
    peak_seen: "2014-04-01",
    year: 2014,
    summary: "test",
    excerpts: [],
    domain: "example.com",
  };
}

const cards = pools.flatMap((pool) => Array.from({ length: 100 }, (_, index) => fakeCard(pool, index)));

const first = drawPack(cards, globalSeed("2026-11-02"), new Set()).map((card) => card.card_id);
const second = drawPack(cards, globalSeed("2026-11-02"), new Set()).map((card) => card.card_id);
if (first.join() !== second.join()) {
  throw new Error("global pack is not deterministic");
}
if (first.join() === drawPack(cards, globalSeed("2026-11-03"), new Set()).map((card) => card.card_id).join()) {
  throw new Error("different days produced the same pack");
}

const slots = drawPack(cards, personalSeed("salt", "2026-11-02", 0), new Set());
if (slots.map((card) => card.pool).join() !== pools.join()) {
  throw new Error(`slot order drifted: ${slots.map((card) => card.pool).join()}`);
}

let pityMisses = 0;
for (let n = 0; n < 200; n += 1) {
  const pack = drawPack(cards, personalSeed("salt", "2026-11-02", n), new Set());
  if (!pack.some((card) => RARITY_RANK[card.rarity] >= 1)) pityMisses += 1;
  if (new Set(pack.map((card) => card.card_id)).size !== 5) {
    throw new Error("pack contained a duplicate");
  }
}
if (pityMisses !== 0) throw new Error(`${pityMisses} packs missed pity`);

const avoid = new Set(cards.filter((card) => card.pool === "book" && card.rarity === "UR").map((card) => card.card_id));
const avoided = drawPack(cards, personalSeed("salt", "2026-04-01", 3), avoid);
if (avoided[0] && avoid.has(avoided[0].card_id) && cards.some((card) => card.pool === "book" && !avoid.has(card.card_id))) {
  throw new Error("avoid set was ignored while alternatives existed");
}

const crowded = new Set(cards.map((card) => card.card_id));
const fallback = drawPack(cards, personalSeed("salt", "2026-04-02", 1), crowded);
if (fallback.length !== 5) throw new Error("empty avoid fallback failed");

console.log("pack checks ok", first.join(" "));
