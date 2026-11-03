import type { Pool, Rarity, SubPool, Tag } from "./types";

export const PRODUCT = "HackerPacks";

export const ATTRIBUTION =
  "Card data is derived from the open-index/hacker-news archive, licensed under ODC-By. HackerPacks is an independent project and is not affiliated with, endorsed by, or sponsored by Y Combinator or Hacker News.";

export const REMOVAL_EMAIL = "removals@hackerpacks.app";

export const DAILY_PACKS = 3;

export const POOLS: Record<
  Pool,
  { label: string; slot: string; blurb: string; source: string }
> = {
  book: {
    label: "Books",
    slot: "Book",
    blurb: "Titles people pressed into the thread.",
    source: "Read the source",
  },
  video: {
    label: "Videos",
    slot: "Video",
    blurb: "Talks and demos that earned the points.",
    source: "Watch",
  },
  showhn: {
    label: "Show HN",
    slot: "Show",
    blurb: "Things someone shipped and showed.",
    source: "Visit the project",
  },
  comment: {
    label: "Scenes",
    slot: "Scene",
    blurb: "Remarks that drew a crowd.",
    source: "Open the linked piece",
  },
  wild: {
    label: "Wild",
    slot: "Wild",
    blurb: "Classics, papers, repos, polls, and front pages.",
    source: "Open the source",
  },
};

export const SLOT_ORDER: Pool[] = ["book", "video", "showhn", "comment", "wild"];

export const RARITY_WORD: Record<Rarity, string> = {
  C: "Common",
  R: "Rare",
  SR: "Super Rare",
  SSR: "Special",
  UR: "Ultra",
};

export const RATES: Array<{ rarity: Rarity; band: string; rate: string; look: string }> = [
  { rarity: "C", band: "Bottom 55%", rate: "55%", look: "Plain paper edge" },
  { rarity: "R", band: "55–83%", rate: "28%", look: "Blue steel edge" },
  { rarity: "SR", band: "83–95%", rate: "12%", look: "Violet edge and gloss" },
  { rarity: "SSR", band: "95–99%", rate: "4%", look: "Gold foil" },
  { rarity: "UR", band: "Top 1%", rate: "1%", look: "Iridescent foil" },
];

export const TAGS: Record<Tag, { mark: string; label: string; note: string }> = {
  antique: { mark: "🏺", label: "Antique", note: "First seen in 2006–2008." },
  gem: {
    mark: "💎",
    label: "Gem",
    note: "High heat, quiet thread. A stand-in for low outside attention when view counts are unavailable.",
  },
  cursed: { mark: "💀", label: "Cursed", note: "A flagged title. The body is not reproduced." },
  hot: {
    mark: "🔥",
    label: "Hot",
    note: "Strong score in the last days of this snapshot, not a live front page.",
  },
};

export const SUBPOOLS: Record<SubPool, { label: string; weight: string }> = {
  classic: { label: "Classic post", weight: "40%" },
  oss: { label: "Open source", weight: "20%" },
  paper: { label: "Paper", weight: "15%" },
  timemachine: { label: "Time machine", weight: "15%" },
  poll: { label: "Poll", weight: "10%" },
};

export const SHARE_ICON: Record<Pool, string> = {
  book: "📚",
  video: "🎬",
  showhn: "🛠️",
  comment: "💬",
  wild: "🎲",
};
