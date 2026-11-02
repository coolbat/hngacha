import type { Pool } from "../lib/types";

export function PoolMark({ pool, className }: { pool: Pool; className?: string }) {
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true as const, fill: "none" };
  if (pool === "book") {
    return (
      <svg {...common}>
        <path d="M4 5.5h6.2A2.3 2.3 0 0 1 12.5 7.8V20H6.2A2.2 2.2 0 0 0 4 17.8V5.5Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M20 5.5h-6.2A2.3 2.3 0 0 0 11.5 7.8V20h6.3A2.2 2.2 0 0 0 20 17.8V5.5Z" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (pool === "video") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 9.4v5.2l4.6-2.6L11 9.4Z" fill="currentColor" />
      </svg>
    );
  }
  if (pool === "showhn") {
    return (
      <svg {...common}>
        <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6L12 3.2Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 12.2 20 7.6M12 12.2 4 7.6M12 12.2v8.6" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (pool === "comment") {
    return (
      <svg {...common}>
        <path d="M6 5.5h12a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9.5L5.5 19v-3H6a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3v18M4.8 7.2l14.4 9.6M19.2 7.2 4.8 16.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Seal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden>
      <rect x="10" y="10" width="60" height="60" rx="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M22 30h36M22 40h24M22 50h30" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="58" cy="50" r="2.5" fill="currentColor" />
    </svg>
  );
}
