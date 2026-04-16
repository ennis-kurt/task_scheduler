import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-2 text-sm text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
