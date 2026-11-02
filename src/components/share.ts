import { POOLS, PRODUCT, SHARE_ICON } from "../lib/content";
import { prettyDay } from "../lib/format";
import { bestCard } from "../lib/packs";
import type { Card, Rarity } from "../lib/types";

const FRAME: Record<Rarity, string> = {
  C: "#b7aea2",
  R: "#6ea2f0",
  SR: "#b08cff",
  SSR: "#e2b14a",
  UR: "#d6ff5c",
};

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= max) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trim()}…`;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(ctx: CanvasRenderingContext2D, card: Card, x: number, y: number, w: number, h: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = FRAME[card.rarity];
  ctx.fill();
  roundRect(ctx, x + 7, y + 7, w - 14, h - 14, 12);
  ctx.fillStyle = "#f4efe6";
  ctx.fill();
  ctx.fillStyle = "#5e574e";
  ctx.font = "500 13px Outfit, sans-serif";
  ctx.fillText(POOLS[card.pool].label.toUpperCase(), x + 18, y + 32);
  ctx.fillStyle = "#1c1915";
  ctx.font = "600 13px 'IBM Plex Mono', monospace";
  ctx.fillText(card.rarity, x + w - 36, y + 32);
  ctx.fillStyle = "#1c1915";
  ctx.font = "560 22px Fraunces, Georgia, serif";
  const lines = wrap(ctx, card.title, w - 36, 4);
  lines.forEach((line, index) => ctx.fillText(line, x + 18, y + 78 + index * 28));
  ctx.restore();
}

export async function renderShare(cards: Card[], day: string, eyebrow: string): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.fillStyle = "#08090d";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#d6ff5c";
  ctx.font = "500 16px 'IBM Plex Mono', monospace";
  ctx.fillText(eyebrow.toUpperCase(), 56, 64);
  ctx.font = "560 42px Fraunces, Georgia, serif";
  ctx.fillStyle = "#f4efe6";
  ctx.fillText(PRODUCT, 56, 112);
  ctx.font = "400 18px Outfit, sans-serif";
  ctx.fillStyle = "#a39b8c";
  ctx.fillText(prettyDay(day), 280, 108);

  const chase = bestCard(cards);
  if (chase) {
    ctx.fillStyle = "#d6ff5c";
    ctx.font = "500 18px Outfit, sans-serif";
    const line = `Chase · ${chase.rarity} · ${chase.title}`;
    ctx.fillText(line.length > 78 ? `${line.slice(0, 76)}…` : line, 56, 156);
  }

  const gap = 16;
  const solo = cards.length === 1;
  const width = solo ? 300 : (1200 - 112 - gap * (cards.length - 1)) / Math.max(cards.length, 1);
  const height = Math.min(420, width * (88 / 63));
  const origin = solo ? (1200 - width) / 2 : 56;
  cards.forEach((card, index) => {
    drawCard(ctx, card, origin + index * (width + gap), 190, width, height);
  });

  ctx.fillStyle = "#6d665c";
  ctx.font = "400 14px Outfit, sans-serif";
  ctx.fillText("open-index/hacker-news · ODC-By · not affiliated with Y Combinator", 56, 600);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not export the image.");
  return blob;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function shareLine(card: Card, scope: "pack" | "card"): string {
  const icon = SHARE_ICON[card.pool];
  if (scope === "pack") {
    return `Today's pack hit ${card.rarity} “${card.title}” ${icon}. What did you draw?`;
  }
  return `Pulled ${card.rarity} “${card.title}” ${icon} on HackerPacks.`;
}
