import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)] outline-none transition focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
