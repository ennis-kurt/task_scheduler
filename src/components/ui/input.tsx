import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)] outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
