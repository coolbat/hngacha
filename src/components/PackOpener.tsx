"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { POOLS } from "../lib/content";
import { beijingDay, localDay, prettyDay } from "../lib/format";
import { bestCard, drawPack, globalSeed, RARITY_RANK, resolveCards } from "../lib/packs";
import {
  abandonInflight,
  dealPersonal,
  markFlip,
  ownCards,
  packsLeft,
  rememberGlobal,
  useVault,
} from "../lib/storage";
import type { Card, Rarity } from "../lib/types";
import { Button } from "./Button";
import { CardView } from "./CardView";
import { useCatalog } from "./CatalogProvider";
import { StatusBlock } from "./Shell";
import { downloadBlob, renderShare, shareLine } from "./share";

type Phase = "seal" | "open" | "summary" | "empty" | "broken";

export function PackOpener({ mode }: { mode: "personal" | "global" }) {
  const { data, loading, error, reload } = useCatalog();
  const vault = useVault();
  const [phase, setPhase] = useState<Phase>("seal");
  const [pack, setPack] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false, false, false]);
  const [burst, setBurst] = useState<Rarity | null>(null);
  const [finale, setFinale] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const lock = useRef(false);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const day = mode === "global" ? beijingDay() : localDay();
  const left = vault ? packsLeft(vault, localDay()) : null;

  useEffect(() => {
    if (mode !== "personal" || !vault || !data) return;
    if (!vault.inflight) return;
    const resolved = resolveCards(data.cards, vault.inflight.cardIds);
    if (!resolved) {
      abandonInflight();
      setPhase("broken");
      return;
    }
    setPack(resolved);
    setFlipped(vault.inflight.flipped);
    setPhase(vault.inflight.flipped.every(Boolean) ? "summary" : "open");
  }, [mode, vault, data]);

  useEffect(() => {
    if (phase === "summary") summaryRef.current?.focus();
  }, [phase]);

  function seal() {
    if (lock.current || !data) return;
    lock.current = true;
    try {
      if (mode === "global") {
        const next = drawPack(data.cards, globalSeed(beijingDay()), new Set());
        setPack(next);
        setFlipped([false, false, false, false, false]);
        setFinale(null);
        setPhase("open");
        setLive("Five cards, face down.");
        return;
      }
      const result = dealPersonal(data.cards, localDay());
      if ("error" in result) {
        setPhase("empty");
        return;
      }
      if (result.resumed) return;
      setPack(result.pack);
      setFlipped([false, false, false, false, false]);
      setFinale(null);
      setPhase("open");
      setLive("Five cards, face down. This uses one pack.");
    } catch {
      setPhase("broken");
    } finally {
      lock.current = false;
    }
  }

  function turn(index: number) {
    if (!pack || flipped[index] || phase !== "open") return;
    const next = flipped.slice();
    next[index] = true;
    setFlipped(next);
    const card = pack[index];
    if (mode === "personal") markFlip(index, card.card_id);
    else ownCards([card.card_id]);
    const max = Math.max(...pack.map((item) => RARITY_RANK[item.rarity]));
    const last = next.every(Boolean);
    if (last && RARITY_RANK[card.rarity] === max) {
      setFinale(index);
      setBurst(card.rarity);
      window.setTimeout(() => setBurst(null), 1600);
    }
    setLive(
      last
        ? `Last card. ${card.rarity}. ${card.title}.`
        : `${POOLS[card.pool].label}. ${card.rarity}. ${card.title}.`,
    );
    if (last) {
      if (mode === "global") rememberGlobal(pack.map((item) => item.card_id), beijingDay());
      window.setTimeout(() => setPhase("summary"), 900);
    }
  }

  async function share() {
    if (!pack) return;
    setShareStatus("loading");
    try {
      const blob = await renderShare(pack, day, mode === "global" ? "Today's global table" : "A personal pack");
      downloadBlob(blob, `hackerpacks-${day}.png`);
      setShareStatus("success");
    } catch {
      setShareStatus("error");
    }
  }

  async function copyLine() {
    if (!pack) return;
    const chase = bestCard(pack);
    if (!chase) return;
    setCopyStatus("loading");
    try {
      await navigator.clipboard.writeText(shareLine(chase, "pack"));
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  if (error) {
    return (
      <StatusBlock
        title="Catalog missed the table"
        body="The card file didn't load, so the seal stays shut."
        action={<Button onClick={reload}>Try again</Button>}
      />
    );
  }

  if (phase === "broken") {
    return (
      <StatusBlock
        title="That pack came apart"
        body="The dealt cards are no longer in the catalog. It was not counted against today."
        action={<Button onClick={() => setPhase("seal")}>Back to the seal</Button>}
      />
    );
  }

  if (phase === "empty" || (phase === "seal" && mode === "personal" && left === 0 && !vault?.inflight)) {
    return (
      <StatusBlock
        title="The table is clear"
        body="You've opened three packs today. They reset at midnight on this device. The global table is still there if you want another look."
        action={
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/open?table=global">Watch today's table</Link>
            <Link className="btn btn-ghost" href="/dex">Browse the dex</Link>
          </div>
        }
      />
    );
  }

  if (phase === "summary" && pack) {
    const chase = bestCard(pack);
    return (
      <div>
        <p className="kicker">{mode === "global" ? `Global table · ${prettyDay(day)}` : `Pack ${(vault?.lastPack?.index ?? 0) + 1} of 3`}</p>
        <h1 ref={summaryRef} tabIndex={-1} className="display mt-3 text-4xl sm:text-5xl">
          {chase ? `${chase.rarity} · ${chase.title}` : "Pack open"}
        </h1>
        <p className="lede mt-4">The highest card leads the share line. Odds stay on the About page. Nothing here asks you to pay for another pull.</p>
        <div className="mt-8 flex gap-3 overflow-x-auto pb-3 xl:grid xl:grid-cols-5">
          {pack.map((card) => (
            <Link key={card.card_id} href={`/card/${card.card_id}`} className="card-link w-[168px] shrink-0 xl:w-auto">
              <CardView card={card} />
            </Link>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button status={shareStatus} successLabel="Saved image" onClick={share}>Share image</Button>
          <Button variant="ghost" status={copyStatus} successLabel="Copied" onClick={copyLine}>Copy line</Button>
          {mode === "personal" && (left ?? 0) > 0 ? (
            <Button variant="quiet" onClick={() => { setPhase("seal"); setPack(null); }}>
              Open another
            </Button>
          ) : (
            <Link className="btn btn-quiet" href="/dex">See the dex</Link>
          )}
        </div>
        {chase ? <p className="mt-4 max-w-xl text-sm text-mute">{shareLine(chase, "pack")}</p> : null}
      </div>
    );
  }

  if (phase === "open" && pack) {
    return (
      <div>
        <p className="sr-only" aria-live="polite">{live}</p>
        {burst ? <div className={`burst burst-${burst}`} aria-hidden /> : null}
        {burst === "UR" ? (
          <div className="particles" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} style={{ ["--i" as string]: index }} />
            ))}
          </div>
        ) : null}
        <p className="kicker">{mode === "global" ? "Global table" : "Personal pack"}</p>
        <h1 className="display mt-3 text-4xl">Turn them in any order.</h1>
        <p className="lede mt-3">Foil backs are SR or better. If the last card you turn is the best in the pack, it gets the room.</p>
        <div className="mt-8 hidden gap-4 md:grid md:grid-cols-5">
          {pack.map((card, index) => (
            <FlipCard key={card.card_id} card={card} flipped={flipped[index]} finale={finale === index} onTurn={() => turn(index)} />
          ))}
        </div>
        <div className="mx-auto mt-8 w-[min(100%,250px)] md:hidden">
          {pack[active] ? (
            <FlipCard card={pack[active]} flipped={Boolean(flipped[active])} finale={finale === active} onTurn={() => turn(active)} />
          ) : null}
          <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Choose a card</p>
          <div className="mt-3 flex justify-center gap-2">
            {pack.map((card, index) => (
              <button
                key={card.card_id}
                className={`h-3 w-8 rounded-full ${index === active ? "bg-phosphor" : "bg-white/20"}`}
                aria-label={`${POOLS[card.pool].label} card ${index + 1}${flipped[index] ? ", turned" : ", face down"}`}
                onClick={() => setActive(index)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl text-center">
      <p className="kicker">{mode === "global" ? `Same table worldwide · ${prettyDay(beijingDay())}` : "Personal pack"}</p>
      <h1 className="display mt-4 text-4xl sm:text-6xl">{mode === "global" ? "Deal the table" : "Break the seal"}</h1>
      <p className="lede mx-auto mt-4">
        {mode === "global"
          ? "This replay does not use one of your three daily packs. The cards are already public on the home page."
          : `This uses one of today's three packs. ${left === null ? "" : `${left} left after this seal.`}`}
      </p>
      <div className="mx-auto mt-8 w-[min(100%,240px)]">
        {loading || !data ? <div className="skel" /> : <CardView card={{ ...data.cards[0], rarity: "C", pool: "book" }} mode="back" />}
      </div>
      <div className="mt-8">
        <Button onClick={seal} disabled={!data || loading} status={loading ? "loading" : "idle"}>
          {mode === "global" ? "Deal the table" : "Break the seal"}
        </Button>
      </div>
    </div>
  );
}

function FlipCard({
  card,
  flipped,
  finale,
  onTurn,
}: {
  card: Card;
  flipped: boolean;
  finale: boolean;
  onTurn: () => void;
}) {
  return (
    <button
      type="button"
      className={`flip-scene ${finale ? "is-finale" : ""}`}
      onClick={onTurn}
      disabled={flipped}
      aria-label={flipped ? `${card.rarity} ${card.title}` : `Face-down ${POOLS[card.pool].label} card`}
    >
      <div className={`flipper ${flipped ? "is-flipped" : ""}`}>
        <div className="flip-face">
          <CardView card={card} />
        </div>
        <div className="flip-back">
          <CardView card={card} mode="back" />
        </div>
      </div>
    </button>
  );
}
