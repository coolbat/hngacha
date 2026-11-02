# HackerPacks

Every day, open a pack of five cards from twenty years of a very opinionated forum: a book, a video, a Show HN, a scene, and a wild card. The project name is HackerPacks. It is not affiliated with Y Combinator or Hacker News.

## Run locally

```bash
npm install
npm run build
npx serve out
```

For development with hot reload:

```bash
npm run dev
```

The production build is a static export in `out/`. Cloudflare Pages can use build command `npm run build` and output directory `out`. No Wrangler publish step is required.

Set `NEXT_PUBLIC_SITE_URL` when you know the public origin so Open Graph URLs resolve. Card share images are drawn in the browser (1200×630). Per-card server OG images are not generated in this static build.

## Rebuild the catalog

The site reads `data/catalog.json` (copied to `public/data/catalog.json`). Rebuild it from the public Parquet archive:

```bash
pip install -r requirements.txt
python3 scripts/build_catalog.py
```

Optional window: `python3 scripts/build_catalog.py --from 2016-01 --to 2016-06`.

The script uses DuckDB `httpfs` to scan monthly files from [open-index/hacker-news](https://huggingface.co/datasets/open-index/hacker-news) (ODC-By). It does not download the full mirror. A full pass through August 2026 takes a few minutes and writes about two thousand cards, capped per year so older seasons stay in the deck.

Check the draw rules without a browser:

```bash
npm run check
```

## Attribution

Card data is derived from the open-index/hacker-news archive, licensed under the Open Data Commons Attribution License (ODC-By). HackerPacks is an independent project and is not affiliated with, endorsed by, or sponsored by Y Combinator or Hacker News. Comment excerpts are at most 300 characters and link back to the original item. The removal form on the About page opens a mail draft to `removals@hackerpacks.app`; change that address before a public launch.

## What the draw does

- One global pack per Beijing date, same for everyone, shown on the home page.
- Three personal packs per local day, reset at local midnight, stored only in `localStorage`.
- Slots are fixed: book, video, Show HN, scene, wild.
- Rarity inside each pool follows the public table (55% / 28% / 12% / 4% / 1%). Every pack has at least one Rare or better.
- While the dex is incomplete, a card seen in the last 30 days is kept out of the personal shuffle.

## Shortcuts versus the full brief

- The deck is a quality cut of roughly two thousand cards, not 5k–20k per pool.
- Blurbs are templates, not model-written. Book titles prefer Open Library when an ISBN resolves.
- Scene heat uses direct replies, because the archive does not publish comment points and only lists direct children.
- Gem is a quiet-thread proxy. YouTube view counts are not fetched. Hot means the last 40 days of the snapshot, not a live front page.
- Show HN sites are not uptime-checked, so there is no offline stamp.
- The 2007 FTP remark (item 9224) is pinned to Ultra.
