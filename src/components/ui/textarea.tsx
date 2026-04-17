import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full rounded-2xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)] outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
