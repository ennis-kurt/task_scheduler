import type { InputHTMLAttributes } from "react";

type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;

export function Checkbox(props: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent-strong)] focus:ring-[var(--accent-strong)]"
      {...props}
    />
  );
}
