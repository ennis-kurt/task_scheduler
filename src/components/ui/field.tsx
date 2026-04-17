import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  description?: string;
  children: ReactNode;
};

export function Field({ label, description, children }: FieldProps) {
  return (
    <label className="grid gap-2">
      <div className="grid gap-1">
        <span className="text-sm font-medium text-[var(--foreground-strong)]">
          {label}
        </span>
        {description ? (
          <span className="text-xs text-[var(--muted-foreground)]">{description}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}
