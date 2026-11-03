import raw from "../../data/catalog.json";
import type { Card, Catalog } from "./types";

/** Server-only catalog reader. Client views fetch /data/catalog.json. */
export function getCatalog(): Catalog {
  return raw as Catalog;
}

export function getCard(id: string): Card | undefined {
  return getCatalog().cards.find((card) => card.card_id === id);
}
