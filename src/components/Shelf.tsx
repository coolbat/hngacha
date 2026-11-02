"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useVault } from "../lib/storage";
import type { Card } from "../lib/types";
import { Button } from "./Button";
import { CardView } from "./CardView";
import { useCatalog } from "./CatalogProvider";
import { StatusBlock } from "./Shell";

type Tab = "owned" | "saved" | "later";

const TABS: Array<{ id: Tab; label: string; empty: string }> = [
  { id: "owned", label: "Opened", empty: "Open a pack and the cards you turn land here." },
  { id: "saved", label: "Saved", empty: "Save a card from its page when you want it kept on purpose." },
  { id: "later", label: "Later", empty: "Later is a quiet pile for things you mean to read or watch." },
];

export function Shelf() {
  const { data, error, reload } = useCatalog();
  const vault = useVault();
  const [tab, setTab] = useState<Tab>("owned");
  const map = useMemo(() => new Map((data?.cards ?? []).map((card) => [card.card_id, card])), [data]);

  if (error) {
    return <StatusBlock title="Shelf didn't open" body="The catalog file missed this page." action={<Button onClick={reload}>Try again</Button>} />;
  }

  const ids = vault ? vault[tab] : [];
  const cards = ids.map((id) => map.get(id)).filter((card): card is Card => Boolean(card));
  const copy = TABS.find((item) => item.id === tab);

  return (
    <div>
      <p className="kicker">On this device</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Shelf</h1>
      <p className="lede mt-4">Saved, later, and opened lists stay in local storage. Nothing is uploaded.</p>
      <div className="mt-6 flex gap-2" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`chip ${tab === item.id ? "is-on" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            <span className="ml-2">{vault ? vault[item.id].length : "–"}</span>
          </button>
        ))}
      </div>
      {!vault || !data ? (
        <p className="mt-8 text-mute">Opening the shelf…</p>
      ) : cards.length === 0 ? (
        <div className="mt-8">
          <p className="text-mute">{copy?.empty}</p>
          <Link className="btn btn-primary mt-6" href={tab === "owned" ? "/open" : "/dex"}>
            {tab === "owned" ? "Open a pack" : "Browse the dex"}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => (
            <li key={card.card_id}>
              <Link href={`/card/${card.card_id}`} className="card-link">
                <CardView card={card} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
