"use client";

import { useState } from "react";
import { toggleList, useVault } from "../lib/storage";
import type { Card } from "../lib/types";
import { Button } from "./Button";
import { downloadBlob, renderShare, shareLine } from "./share";

export function CardActions({ card }: { card: Card }) {
  const vault = useVault();
  const saved = vault?.saved.includes(card.card_id) ?? false;
  const later = vault?.later.includes(card.card_id) ?? false;
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <Button
        variant={saved ? "primary" : "quiet"}
        status={saved ? "success" : "idle"}
        successLabel="Saved"
        onClick={() => toggleList("saved", card.card_id)}
      >
        {saved ? "Saved" : "Save"}
      </Button>
      <Button variant={later ? "primary" : "quiet"} onClick={() => toggleList("later", card.card_id)}>
        {later ? "In later" : "Later"}
      </Button>
      <Button
        variant="ghost"
        status={shareStatus}
        successLabel="Saved image"
        onClick={async () => {
          setShareStatus("loading");
          try {
            const blob = await renderShare([card], card.first_seen || "pack", "A single card");
            downloadBlob(blob, `hackerpacks-${card.card_id}.png`);
            setShareStatus("success");
          } catch {
            setShareStatus("error");
          }
        }}
      >
        Share image
      </Button>
      <Button
        variant="ghost"
        status={copyStatus}
        successLabel="Copied"
        onClick={async () => {
          setCopyStatus("loading");
          try {
            await navigator.clipboard.writeText(shareLine(card, "card"));
            setCopyStatus("success");
          } catch {
            setCopyStatus("error");
          }
        }}
      >
        Copy line
      </Button>
    </div>
  );
}
