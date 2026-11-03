"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DAILY_PACKS, POOLS } from "../lib/content";
import { beijingDay, cn, localDay, prettyDay } from "../lib/format";
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
type Ritual = "idle" | "shake" | "tear";

export function PackOpener({ mode }: { mode: "personal" | "global" }) {
  const { data, loading, error, reload } = useCatalog();
  const vault = useVault();
  const [phase, setPhase] = useState<Phase>("seal");
  const [pack, setPack] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false, false, false]);
  const [burst, setBurst] = useState<Rarity | null>(null);
  const [finale, setFinale] = useState<number | null>(null);
  const [ritual, setRitual] = useState<Ritual>("idle");
  const [incoming, setIncoming] = useState(false);
  const [dealt, setDealt] = useState(false);
  const [flash, setFlash] = useState<"SSR" | "UR" | null>(null);
  const [live, setLive] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const lock = useRef(false);
  const flippedRef = useRef(flipped);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const timers = useRef<number[]>([]);
  flippedRef.current = flipped;
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
    setIncoming(false);
    setDealt(true);
    setPhase(vault.inflight.flipped.every(Boolean) ? "summary" : "open");
  }, [mode, vault, data]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (phase !== "open" || !incoming) return;
    const id = window.requestAnimationFrame(() => setDealt(true));
    return () => window.cancelAnimationFrame(id);
  }, [phase, incoming]);

  useEffect(() => {
    if (phase === "summary") summaryRef.current?.focus();
  }, [phase]);

  function beginReveal(nextPack: Card[]) {
    const blank = [false, false, false, false, false];
    flippedRef.current = blank;
    setPack(nextPack);
    setFlipped(blank);
    setFinale(null);
    setFlash(null);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setIncoming(false);
      setDealt(true);
      setPhase("open");
      setLive("Five cards, face down.");
      lock.current = false;
      return;
    }
    setRitual("shake");
    setLive("Shaking the pack.");
    timers.current.push(window.setTimeout(() => setRitual("tear"), 550));
    timers.current.push(window.setTimeout(() => {
      setRitual("idle");
      setIncoming(true);
      setDealt(false);
      setPhase("open");
      setLive("Five cards, face down. Glowing backs are SR or better.");
      lock.current = false;
    }, 1100));
  }

  function seal() {
    if (lock.current || !data || ritual !== "idle") return;
    lock.current = true;
    try {
      if (mode === "global") {
        beginReveal(drawPack(data.cards, globalSeed(beijingDay()), new Set()));
        return;
      }
      const result = dealPersonal(data.cards, localDay());
      if ("error" in result) {
        setPhase("empty");
        lock.current = false;
        return;
      }
      if (result.resumed) {
        lock.current = false;
        return;
      }
      beginReveal(result.pack);
    } catch {
      setPhase("broken");
      lock.current = false;
    }
  }

  function turn(index: number) {
    if (!pack || flippedRef.current[index] || phase !== "open") return;
    const next = flippedRef.current.slice();
    next[index] = true;
    flippedRef.current = next;
    setFlipped(next);
    const card = pack[index];
    if (mode === "personal") markFlip(index, card.card_id);
    else ownCards([card.card_id]);
    if (card.rarity === "SSR" || card.rarity === "UR") {
      setFlash(null);
      window.requestAnimationFrame(() => setFlash(card.rarity as "SSR" | "UR"));
    }
    const max = Math.max(...pack.map((item) => RARITY_RANK[item.rarity]));
    const last = next.every(Boolean);
    if (last && RARITY_RANK[card.rarity] === max) {
      setFinale(index);
      setBurst(card.rarity);
      timers.current.push(window.setTimeout(() => setBurst(null), 1600));
    }
    setLive(
      last
        ? `Last card. ${card.rarity}. ${card.title}.`
        : `${POOLS[card.pool].label}. ${card.rarity}. ${card.title}.`,
    );
    if (last) {
      if (mode === "global") rememberGlobal(pack.map((item) => item.card_id), beijingDay());
      timers.current.push(window.setTimeout(() => setPhase("summary"), 700));
    }
  }

  function revealAll() {
    if (!pack) return;
    let step = 0;
    pack.forEach((_, index) => {
      if (flippedRef.current[index]) return;
      const delay = step * 160;
      step += 1;
      timers.current.push(window.setTimeout(() => turn(index), delay));
    });
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
        <QuotaPips left={left} />
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
    const unturned = flipped.filter((value) => !value).length;
    return (
      <div>
        <p className="sr-only" aria-live="polite">{live}</p>
        <QuotaPips left={left} />
        {flash ? (
          <div
            key={flash + flipped.filter(Boolean).length}
            className="reveal-flash go"
            style={{
              background: flash === "UR"
                ? "radial-gradient(circle, rgba(255,122,182,.55), rgba(94,159,232,.22) 48%, transparent 72%)"
                : "radial-gradient(circle, rgba(234,194,107,.5), transparent 68%)",
            }}
            aria-hidden
          />
        ) : null}
        {burst ? <div className={`burst burst-${burst}`} aria-hidden /> : null}
        {burst === "UR" ? (
          <div className="particles" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} style={{ ["--i" as string]: index }} />
            ))}
          </div>
        ) : null}
        <div className="gacha-stage">
          <div className="gacha-cards">
            {pack.map((card, index) => (
              <FlipCard
                key={card.card_id}
                card={card}
                index={index}
                flipped={Boolean(flipped[index])}
                finale={finale === index}
                incoming={incoming}
                dealt={dealt}
                onTurn={() => turn(index)}
              />
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-mute">
          {unturned > 0 ? "Tap a card. A glowing back is SR or better. Drag a foil card to catch the holo." : "Every card is up."}
        </p>
        {unturned > 0 ? (
          <div className="mt-4 text-center">
            <Button variant="ghost" onClick={revealAll}>Turn them all</Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <QuotaPips left={left} />
      <p className="kicker text-center">{mode === "global" ? `Same table worldwide · ${prettyDay(beijingDay())}` : "Personal pack"}</p>
      <div className="gacha-stage">
        {loading || !data ? <div className="skel w-[210px]" /> : (
          <button
            type="button"
            className={cn("pack-btn", ritual === "shake" && "is-shaking", ritual === "tear" && "is-torn")}
            onClick={seal}
            disabled={ritual !== "idle"}
            aria-label={mode === "global" ? "Tear open today's table" : "Tear open a pack"}
          >
            <div className="foil-pack">
              <div className="pack-top">TEAR HERE</div>
              <div className="pack-body">
                <div className="pack-mark" aria-hidden>HP</div>
                <div className="pack-title">{mode === "global" ? "Today's table" : "Today's pack"}</div>
                <div className="pack-sub">Book · Video · Show HN<br />Scene · Wild</div>
                <div className="pack-count">5 cards · R+ guaranteed</div>
              </div>
            </div>
            <span className={cn("pack-burst", ritual === "tear" && "go")} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-sm text-mute">
        {mode === "global"
          ? "Tap the pack. This replay does not use one of your three daily packs."
          : "Tap the pack to tear it open. This uses one of today's three packs."}
      </p>
    </div>
  );
}

function QuotaPips({ left }: { left: number | null }) {
  return (
    <div className="mb-4 flex items-center justify-end gap-2 text-sm text-mute">
      <span>Today</span>
      <div className="flex gap-1" role="img" aria-label={left === null ? "Checking packs" : `${left} of ${DAILY_PACKS} packs remaining`}>
        {Array.from({ length: DAILY_PACKS }, (_, index) => (
          <span key={index} className={cn("pip", left !== null && index < left && "is-lit")} />
        ))}
      </div>
      <span className="font-mono text-xs">{left === null ? "–" : `${left}/${DAILY_PACKS}`}</span>
    </div>
  );
}

function FlipCard({
  card,
  index,
  flipped,
  finale,
  incoming,
  dealt,
  onTurn,
}: {
  card: Card;
  index: number;
  flipped: boolean;
  finale: boolean;
  incoming: boolean;
  dealt: boolean;
  onTurn: () => void;
}) {
  function tilt(event: PointerEvent<HTMLButtonElement>) {
    if (!flipped) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    event.currentTarget.style.setProperty("--ry", `${(x - 0.5) * 16}deg`);
    event.currentTarget.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    event.currentTarget.style.setProperty("--mx", `${x * 100}%`);
    event.currentTarget.style.setProperty("--my", `${y * 100}%`);
  }

  return (
    <button
      type="button"
      className={cn("flip-scene", flipped && "is-flipped", finale && "is-finale", incoming && "is-incoming", dealt && "is-dealt")}
      style={{ ["--deal" as string]: index }}
      data-rarity={card.rarity}
      onClick={onTurn}
      onPointerMove={tilt}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty("--rx", "0deg");
        event.currentTarget.style.setProperty("--ry", "0deg");
      }}
      aria-label={flipped ? `${card.rarity} ${card.title}` : `Face-down ${POOLS[card.pool].label} card`}
    >
      <div className={cn("flipper", flipped && "is-flipped")}>
        <div className="flip-face">
          <CardView card={card} />
          <span className="holo" aria-hidden />
        </div>
        <div className="flip-back">
          <CardView card={card} mode="back" />
        </div>
      </div>
    </button>
  );
}
