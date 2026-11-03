"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ATTRIBUTION, PRODUCT } from "../lib/content";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/open", label: "Open" },
  { href: "/dex", label: "Dex" },
  { href: "/collection", label: "Shelf" },
  { href: "/about", label: "About" },
];

function normalize(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function Wordmark() {
  return (
    <span className="font-serif text-xl tracking-tight text-[#ebe6dc]">
      Hacker<span className="italic text-phosphor">Packs</span>
    </span>
  );
}

function NavLinks({ variant }: { variant: "row" | "bar" }) {
  const pathname = normalize(usePathname() || "/");
  return (
    <nav
      className={variant === "row" ? "hidden items-center gap-6 md:flex" : "fixed inset-x-0 bottom-0 z-20 flex border-t border-white/10 bg-[#08090d]/95 px-2 pt-2 backdrop-blur md:hidden"}
      style={variant === "bar" ? { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" } : undefined}
      aria-label={variant === "row" ? "Primary" : "Mobile"}
    >
      {NAV.map((item) => {
        const active = normalize(item.href) === pathname;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              variant === "row"
                ? `text-sm ${active ? "text-phosphor" : "text-[#ebe6dc]"}`
                : `flex-1 py-2 text-center font-mono text-[11px] uppercase tracking-wider ${active ? "text-phosphor" : "text-mute"}`
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#08090d]/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between px-4 md:px-6">
          <Link href="/" aria-label={PRODUCT}>
            <Wordmark />
          </Link>
          <NavLinks variant="row" />
        </div>
      </header>
      <main id="content" className="mobile-clear mx-auto w-full max-w-page px-4 pt-8 md:px-6 md:pb-16 md:pt-12">
        {children}
      </main>
      <footer className="mobile-clear border-t border-white/10 md:pb-0">
        <div className="mx-auto flex max-w-page flex-col gap-3 px-4 py-8 text-sm text-mute md:px-6">
          <p>{ATTRIBUTION}</p>
          <p className="font-mono text-xs tracking-wide">Excerpts are capped at 300 characters and link back to the original thread.</p>
        </div>
      </footer>
      <NavLinks variant="bar" />
    </>
  );
}

export function StatusBlock({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10" role="status">
      <h2 className="display text-3xl">{title}</h2>
      <p className="mt-3 max-w-prose text-mute">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
