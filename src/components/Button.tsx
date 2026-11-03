"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/format";

type Status = "idle" | "loading" | "success" | "error";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet";
  status?: Status;
  successLabel?: string;
};

export function Button({
  variant = "primary",
  status = "idle",
  successLabel = "Done",
  className,
  children,
  disabled,
  ...rest
}: Props) {
  const busy = status === "loading";
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn("btn", `btn-${variant}`, status !== "idle" && `is-${status}`, className)}
    >
      {busy ? <span className="spinner" aria-hidden /> : null}
      <span>{status === "success" ? successLabel : children}</span>
    </button>
  );
}
