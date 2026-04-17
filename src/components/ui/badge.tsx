import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "danger" | "success";
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.02em]",
        tone === "neutral" && "bg-[var(--panel-subtle)] text-[var(--muted-foreground)]",
        tone === "accent" && "bg-[var(--accent-soft)] text-[var(--accent-stronger)]",
        tone === "danger" && "bg-[var(--danger-soft)] text-[var(--danger)]",
        tone === "success" && "bg-[var(--success-soft)] text-[var(--success)]",
        className,
      )}
      {...props}
    />
  );
}
