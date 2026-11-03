import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardActions } from "../../../components/CardActions";
import { CardView } from "../../../components/CardView";
import { Shell } from "../../../components/Shell";
import { POOLS, RARITY_WORD, SUBPOOLS, TAGS } from "../../../lib/content";
import { getCard, getCatalog } from "../../../lib/catalog";
import { prettyDay, threadUrl } from "../../../lib/format";

export function generateStaticParams() {
  return getCatalog().cards.map((card) => ({ id: card.card_id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const card = getCard(id);
  if (!card) return { title: "Card" };
  return {
    title: card.title,
    description: card.summary,
  };
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = getCard(id);
  if (!card) notFound();
  const cursed = card.tags.includes("cursed");
  const thread = threadUrl(card.primary_hn_id);
  const pool = POOLS[card.pool];

  return (
    <Shell>
      <article className="grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
        <div className="order-2 mx-auto w-full max-w-[320px] lg:order-1">
          <CardView card={card} />
        </div>
        <div className="order-1 lg:order-2">
          <p className="kicker">
            <Link href="/dex" className="hover:underline">{pool.label}</Link>
            {card.sub_pool ? ` · ${SUBPOOLS[card.sub_pool].label}` : ""} · {card.rarity} {RARITY_WORD[card.rarity]}
          </p>
          <h1 className="display mt-3 text-4xl sm:text-5xl">{card.title}</h1>
          <p className="mt-3 text-lg text-mute">{card.subtitle}</p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed">{card.summary}</p>
          {card.tags.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <li key={tag} className="rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-phosphor">
                  {TAGS[tag].mark} {TAGS[tag].label} — {TAGS[tag].note}
                </li>
              ))}
            </ul>
          ) : null}
          <CardActions card={card} />
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            {!cursed && card.external_url ? (
              <a className="text-phosphor underline-offset-4 hover:underline" href={card.external_url} target="_blank" rel="noreferrer">
                {pool.source}
              </a>
            ) : null}
            {thread ? (
              <a className="text-phosphor underline-offset-4 hover:underline" href={thread} target="_blank" rel="noreferrer">
                {cursed ? "Flagged thread" : "Open the thread"}
              </a>
            ) : null}
          </div>
          {card.excerpts.length > 0 ? (
            <section className="mt-10" aria-labelledby="excerpts-heading">
              <h2 id="excerpts-heading" className="font-serif text-2xl">
                {card.excerpts[0]?.kind === "headline" ? "That day's front page" : card.excerpts[0]?.kind === "option" ? "Choices" : "From the thread"}
              </h2>
              <ul className="mt-4 space-y-4">
                {card.excerpts.map((excerpt) => (
                  <li key={`${excerpt.kind}-${excerpt.hn_id}-${excerpt.text.slice(0, 24)}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    {excerpt.kind === "quote" ? (
                      <blockquote className="font-serif text-xl leading-snug">“{excerpt.text}”</blockquote>
                    ) : (
                      <p>{excerpt.text}</p>
                    )}
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-mute">
                      {excerpt.by ? `${excerpt.by} · ` : ""}
                      {excerpt.time ? prettyDay(excerpt.time) : ""}
                      {excerpt.hn_id ? (
                        <>
                          {" · "}
                          <a className="text-phosphor" href={threadUrl(excerpt.hn_id)} target="_blank" rel="noreferrer">
                            Thread
                          </a>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="mt-10" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="font-serif text-2xl">On the timeline</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              <li className="rounded-2xl border border-white/10 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">First seen</p>
                <p className="mt-2 font-serif text-xl">{card.first_seen ? prettyDay(card.first_seen) : "—"}</p>
              </li>
              <li className="rounded-2xl border border-white/10 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Peak</p>
                <p className="mt-2 font-serif text-xl">{card.peak_seen ? prettyDay(card.peak_seen) : "—"}</p>
              </li>
              <li className="rounded-2xl border border-white/10 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Latest</p>
                <p className="mt-2 font-serif text-xl">{card.last_seen ? prettyDay(card.last_seen) : "—"}</p>
              </li>
            </ol>
          </section>
        </div>
      </article>
    </Shell>
  );
}
