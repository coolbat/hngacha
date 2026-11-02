import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Mono, Outfit } from "next/font/google";
import { CatalogProvider } from "../components/CatalogProvider";
import "./globals.css";

const serif = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: {
    default: "HackerPacks",
    template: "%s · HackerPacks",
  },
  description:
    "Open a daily pack of five cards — books, videos, Show HN, scenes, and wild finds — drawn from twenty years of a very opinionated forum.",
  openGraph: {
    title: "HackerPacks",
    description: "Five cards. One table. Twenty years of the forum.",
    images: [{ url: "/og.svg", width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <CatalogProvider>{children}</CatalogProvider>
      </body>
    </html>
  );
}
