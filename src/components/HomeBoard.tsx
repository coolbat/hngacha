"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { POOLS, SLOT_ORDER } from "../lib/content";
import { beijingDay, cn, localDay, prettyDay } from "../lib/format";
import { bestCard, drawPack, globalSeed } from "../lib/packs";
import { packsLeft, rememberGlobal, useVault } from "../lib/storage";
import { Button } from "./Button";
import { CardSkeleton, CardView } from "./CardView";
import { useCatalog } from "./CatalogProvider";
import { PoolMark } from "./icons";
import { StatusBlock } from "./Shell";
import { downloadBlob, renderShare, shareLine } from "./share";

export function HomeBoard() {
  const { data, loading, error, reload } = useCatalog();
  const vault = useVault();
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const tableDay = beijingDay();
  const deviceDay = localDay();

  const pack = useMemo(() => {
    if (!data) return null;
    try {
      return drawPack(data.cards, globalSeed(tableDay), new Set());
    } catch {
      return null;
    }
  }, [data, tableDay]);

  const chase = pack ? bestCard(pack) : null;
  const left = vault ? packsLeft(vault, deviceDay) : null;
  const saved = vault?.globalSavedDay === tableDay || saveStatus === "success";

  async function share() {
    if (!pack) return;
    setShareStatus("loading");
    try {
      const blob = await renderShare(pack, tableDay, "Today's global table");
      downloadBlob(blob, `hackerpacks-${tableDay}.png`);
      setShareStatus("success");
    } catch {
      setShareStatus("error");
    }
  }

  async function copyLine() {
    if (!chase) return;
    try {
      await navigator.clipboard.writeText(shareLine(chase, "pack"));
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="space-y-12">
      <section className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
        <div>
          <p className="kicker">Daily table · {prettyDay(tableDay)}</p>
          <h1 className="display mt-4 text-4xl sm:text-5xl lg:text-6xl">Five cards from twenty years of the forum.</h1>
          <p className="lede mt-5">
            A book, a video, a Show HN, a scene, and one thing that refuses a shelf. The global table is the same for everyone. Three personal packs reset at midnight on this device.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/open">Open a pack</Link>
            <Link className="btn btn-ghost" href="/dex">Browse the dex</Link>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex gap-2" role="img" aria-label={left === null ? "Checking packs" : `${left} of 3 packs remaining`}>
              {[0, 1, 2].map((index) => (
                <span key={index} className={cn("pip", left !== null && index < left && "is-lit")} />
              ))}
            </div>
            <p className="font-mono text-xs text-mute">
              {left === null
                ? "Checking today's packs"
                : left === 0
                  ? "Three packs opened today. The seal resets at midnight."
                  : `${left} free ${left === 1 ? "pack" : "packs"} left today`}
            </p>
          </div>
        </div>
        <div className="hidden lg:block">
          {chase ? (
            <Link href={`/card/${chase.card_id}`} className="card-link">
              <CardView card={chase} />
            </Link>
          ) : (
            <CardSkeleton />
          )}
          <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Today&apos;s chase card</p>
        </div>
      </section>

      <section aria-labelledby="table-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="table-heading" className="display text-3xl">Today&apos;s global pack</h2>
            <p className="mt-2 text-sm text-mute">Seeded from the Beijing date, so the chase card is a shared conversation.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" status={shareStatus} successLabel="Saved image" onClick={share} disabled={!pack}>
              Share image
            </Button>
            <Button variant="ghost" status={copyStatus === "error" ? "error" : copyStatus === "success" ? "success" : "idle"} successLabel="Copied" onClick={copyLine} disabled={!chase}>
              Copy line
            </Button>
            <Button
              variant="ghost"
              status={saved ? "success" : "idle"}
              successLabel="On your dex"
              onClick={() => {
                if (!pack) return;
                rememberGlobal(pack.map((card) => card.card_id), tableDay);
                setSaveStatus("success");
              }}
              disabled={!pack}
            >
              Save to dex
            </Button>
          </div>
        </div>
        {error ? (
          <StatusBlock title="Catalog missed the table" body="The card file didn't load. The draw can wait." action={<Button onClick={reload}>Try again</Button>} />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-3 xl:grid xl:grid-cols-5 xl:overflow-visible">
            {pack
              ? pack.map((card) => (
                  <Link key={card.card_id} href={`/card/${card.card_id}`} className="card-link w-[150px] shrink-0 snap-start xl:w-auto">
                    <CardView card={card} />
                  </Link>
                ))
              : Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="w-[150px] shrink-0 xl:w-auto">
                    <CardSkeleton />
                  </div>
                ))}
          </div>
        )}
        {loading && !data ? <p className="mt-3 font-mono text-xs text-mute">Shuffling the archive…</p> : null}
        <p className="mt-4">
          <Link href="/open?table=global" className="text-sm text-phosphor underline-offset-4 hover:underline">
            Watch the deal
          </Link>
        </p>
      </section>

      <section aria-labelledby="slots-heading">
        <h2 id="slots-heading" className="display text-3xl">The five slots</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SLOT_ORDER.map((pool, index) => (
            <li key={pool} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-phosphor">
                <PoolMark pool={pool} className="h-5 w-5" />
                <span className="font-mono text-[11px] tracking-[0.14em]">0{index + 1}</span>
              </div>
              <h3 className="mt-4 font-serif text-2xl">{POOLS[pool].label}</h3>
              <p className="mt-2 text-sm text-mute">{POOLS[pool].blurb}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
