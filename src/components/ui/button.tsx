import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        solid:
          "bg-[var(--accent-strong)] px-4 py-2 text-white shadow-sm hover:bg-[var(--accent-stronger)]",
        outline:
          "border border-[var(--border-strong)] bg-white/80 px-4 py-2 text-[var(--foreground)] hover:bg-[var(--panel-subtle)]",
        ghost:
          "px-3 py-2 text-[var(--muted-foreground)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]",
        danger:
          "bg-[var(--danger)] px-4 py-2 text-white hover:opacity-90",
      },
      size: {
        sm: "h-9 gap-2 px-3 text-xs",
        md: "h-10 gap-2 px-4",
        lg: "h-11 gap-2 px-5",
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
