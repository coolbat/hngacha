export type Pool = "book" | "video" | "showhn" | "comment" | "wild";
export type SubPool = "classic" | "paper" | "oss" | "poll" | "timemachine";
export type Rarity = "C" | "R" | "SR" | "SSR" | "UR";
export type Tag = "antique" | "gem" | "cursed" | "hot";

export interface Excerpt {
  hn_id: number;
  by: string;
  text: string;
  time: string;
  kind: "quote" | "headline" | "option";
}

export interface Card {
  card_id: string;
  pool: Pool;
  sub_pool: SubPool | null;
  title: string;
  subtitle: string;
  image_url: string | null;
  hn_item_ids: number[];
  primary_hn_id: number;
  external_url: string;
  heat_score: number;
  mentions: number;
  rarity: Rarity;
  tags: Tag[];
  first_seen: string;
  last_seen: string;
  peak_seen: string;
  year: number;
  summary: string;
  excerpts: Excerpt[];
  domain: string;
}

export interface Catalog {
  version: number;
  generated_at: string;
  source: string;
  license: string;
  months: string[];
  newest_day: string;
  pool_counts: Partial<Record<Pool, number>>;
  card_count: number;
  notes: string[];
  cards: Card[];
}
