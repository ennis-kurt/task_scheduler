import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        solid:
          "bg-[var(--button-solid-bg)] px-4 py-2 text-[var(--button-solid-fg)] shadow-[var(--shadow-soft)] hover:bg-[var(--button-solid-hover)]",
        outline:
          "border border-[var(--border-strong)] bg-[var(--button-outline-bg)] px-4 py-2 text-[var(--foreground)] shadow-[var(--shadow-soft)] hover:bg-[var(--button-outline-hover)]",
        ghost:
          "px-3 py-2 text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]",
        danger:
          "bg-[var(--danger)] px-4 py-2 text-white shadow-[var(--shadow-soft)] hover:opacity-90",
      },
      size: {
        sm: "h-8 gap-2 px-3 text-[11px]",
        md: "h-9 gap-2 px-4 text-sm",
        lg: "h-10 gap-2 px-5 text-sm",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "solid",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);

Button.displayName = "Button";
