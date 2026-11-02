import { RemovalForm } from "../../components/RemovalForm";
import { Shell } from "../../components/Shell";
import { ATTRIBUTION, RATES, SUBPOOLS } from "../../lib/content";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <Shell>
      <p className="kicker">Colophon</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">About the table</h1>
      <p className="lede mt-4">
        HackerPacks is a discovery shelf. Each day has one shared pack and three personal ones. There is nothing to buy, no countdown, and no “draw again” nudge.
      </p>

      <section id="sources" className="mt-12 max-w-3xl scroll-mt-24">
        <h2 className="font-serif text-3xl">Sources</h2>
        <p className="mt-4 leading-relaxed text-[#ebe6dc]">{ATTRIBUTION}</p>
        <p className="mt-4 leading-relaxed text-mute">
          The archive is{" "}
          <a className="text-phosphor underline-offset-4 hover:underline" href="https://huggingface.co/datasets/open-index/hacker-news">
            open-index/hacker-news
          </a>{" "}
          on Hugging Face: monthly Parquet files of stories, comments, polls, and jobs. This snapshot stops at the newest month present when the catalog was built (through August 2026 in the public files available here). Comment text on a card is at most 300 characters and links back to the original item. Deleted items are dropped.
        </p>
      </section>

      <section id="odds" className="mt-12 scroll-mt-24">
        <h2 className="font-serif text-3xl">Odds</h2>
        <p className="mt-4 max-w-3xl text-mute">
          Each slot rolls its own rarity inside its pool. A pack that would be five commons redraws the wild card until it is Rare or better. While your dex is incomplete, a card drawn in the last 30 days stays out of the personal shuffle.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-wider text-mute">
              <tr>
                <th className="border-b border-white/10 py-3 pr-4 font-medium">Rarity</th>
                <th className="border-b border-white/10 py-3 pr-4 font-medium">Band inside the pool</th>
                <th className="border-b border-white/10 py-3 pr-4 font-medium">Rate</th>
                <th className="border-b border-white/10 py-3 font-medium">Frame</th>
              </tr>
            </thead>
            <tbody>
              {RATES.map((row) => (
                <tr key={row.rarity}>
                  <td className="border-b border-white/10 py-3 pr-4 font-serif text-xl">{row.rarity}</td>
                  <td className="border-b border-white/10 py-3 pr-4">{row.band}</td>
                  <td className="border-b border-white/10 py-3 pr-4 font-mono">{row.rate}</td>
                  <td className="border-b border-white/10 py-3">{row.look}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-8 font-serif text-2xl">Wild slot weights</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(SUBPOOLS).map(([key, value]) => (
            <li key={key} className="flex justify-between rounded-xl border border-white/10 px-4 py-3">
              <span>{value.label}</span>
              <span className="font-mono text-phosphor">{value.weight}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="algorithm" className="mt-12 max-w-3xl scroll-mt-24">
        <h2 className="font-serif text-3xl">How a card is scored</h2>
        <ul className="mt-4 space-y-3 leading-relaxed text-mute">
          <li>Books: unique people who linked the title × 0.6, plus recommendation-shaped notes × 1. Links come from Goodreads, Open Library, Bookshop, Google Books, and Amazon book URLs. No model writes the blurb.</li>
          <li>Videos: sum of thread points, plus comment mentions of the same video × 5. Thumbnails are the public YouTube image. View counts are not fetched.</li>
          <li>Show HN: points + comments × 0.5, kept when the score is at least 10. Sites are not checked for uptime, so there is no “offline” stamp yet.</li>
          <li>Scenes: direct replies × 1.3 + parent thread score × 0.01. The archive does not publish comment points, and the kids list is only the first level, so subtree size is approximated by those direct replies. One 2007 remark on the Dropbox thread is pinned to UR.</li>
          <li>Wild: classics, papers, GitHub repositories, polls (by counted votes), and a time-machine card for a strong day. Rarity is the percentile of heat inside the pool, after a per-year cap so older seasons stay in the deck.</li>
          <li>Antique means first seen in 2006–2008. Gem means a high-heat video with a short thread. Cursed means a flagged title with no body. Hot means a strong score in the last days of this snapshot, not a live front page.</li>
        </ul>
      </section>

      <section id="removal" className="mt-12 max-w-xl scroll-mt-24">
        <h2 className="font-serif text-3xl">Removal</h2>
        <p className="mt-4 text-mute">
          If a card quotes you and you want it gone, ask. The target is to take it down within 48 hours of a real request.
        </p>
        <RemovalForm />
      </section>
    </Shell>
  );
}
