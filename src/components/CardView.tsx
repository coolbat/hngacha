"use client";

import { useState } from "react";
import { POOLS, RARITY_WORD, TAGS } from "../lib/content";
import { cn, formatHeat } from "../lib/format";
import { RARITY_RANK } from "../lib/packs";
import type { Card } from "../lib/types";
import { PoolMark, Seal } from "./icons";

const TINTS = ["#243026", "#2a241c", "#241c2a", "#1c2430", "#30241c"];

function tint(id: string): string {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n + id.charCodeAt(i)) % TINTS.length;
  return TINTS[n] ?? TINTS[0];
}

function monogram(card: Card): string {
  const source = card.domain || card.subtitle || card.title;
  const parts = source.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0] || "").join("");
  return (letters || card.pool.slice(0, 2)).toUpperCase();
}

export function CardView({ card, mode = "full" }: { card: Card; mode?: "full" | "shadow" | "back" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const pool = POOLS[card.pool];
  const foil = RARITY_RANK[card.rarity] >= 2;

  if (mode === "back") {
    return (
      <article className={cn("card is-back", foil && "is-foil", `rarity-${card.rarity}`)}>
        <div className="card-shell">
          <div className="card-paper">
            <span className="card-sheen" aria-hidden />
            <Seal className="seal" />
            <p className="back-slot">{pool.slot}</p>
          </div>
        </div>
      </article>
    );
  }

  if (mode === "shadow") {
    return (
      <article className={cn("card is-shadow", `rarity-${card.rarity}`)} aria-label={`Undrawn ${pool.label}, ${card.year}, ${RARITY_WORD[card.rarity]}`}>
        <div className="card-shell">
          <div className="card-paper">
            <div className="card-top">
              <span className="card-pool">
                <PoolMark pool={card.pool} />
                {pool.label}
              </span>
              <span className="rarity-pill">{card.rarity}</span>
            </div>
            <div className="art">
              <div className="bars" aria-hidden>
                <i /><i /><i />
              </div>
            </div>
            <p className="year-ghost">{card.year || "——"}</p>
          </div>
        </div>
      </article>
    );
  }

  const showImage = Boolean(card.image_url) && !imageFailed && card.pool !== "comment";

  return (
    <article className={cn("card", `rarity-${card.rarity}`)}>
      <div className="card-shell">
        <div className="card-paper">
          <span className="card-sheen" aria-hidden />
          <div className="card-top">
            <span className="card-pool">
              <PoolMark pool={card.pool} />
              {pool.label}
            </span>
            <span className="rarity-pill" title={RARITY_WORD[card.rarity]}>
              {card.rarity}
            </span>
          </div>
          <div className="art">
            {showImage ? (
              <img
                src={card.image_url || ""}
                alt=""
                className={card.pool === "book" ? "is-contain" : undefined}
                onError={() => setImageFailed(true)}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalWidth < 130) setImageFailed(true);
                }}
              />
            ) : card.pool === "comment" ? (
              <span className="watermark" aria-hidden>“</span>
            ) : (
              <div className="art-type" style={{ backgroundColor: tint(card.card_id) }}>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-phosphor">{pool.slot}</span>
                <span className="art-mark">{monogram(card)}</span>
              </div>
            )}
          </div>
          <h3 className="card-title">{card.title}</h3>
          <p className="card-sub">{card.subtitle}</p>
          {card.tags.length > 0 ? (
            <div className="card-tags">
              {card.tags.map((tag) => (
                <span key={tag} className="stamp" title={TAGS[tag].note}>
                  {TAGS[tag].mark} {TAGS[tag].label}
                </span>
              ))}
            </div>
          ) : null}
          <footer className="card-stats">
            <span><span className="stat-k">Heat</span><span className="stat-v">{formatHeat(card.heat_score)}</span></span>
            <span><span className="stat-k">Mentions</span><span className="stat-v">{card.mentions}</span></span>
            <span><span className="stat-k">Year</span><span className="stat-v">{card.year || "—"}</span></span>
          </footer>
        </div>
      </div>
    </article>
  );
}

export function CardSkeleton() {
  return <div className="skel" aria-hidden />;
}
