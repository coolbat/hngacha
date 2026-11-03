"use client";

import { useSearchParams } from "next/navigation";
import { PackOpener } from "./PackOpener";

export function PackGate() {
  const params = useSearchParams();
  const mode = params.get("table") === "global" ? "global" : "personal";
  return <PackOpener key={mode} mode={mode} />;
}
