import { useId } from "react";

import { cn } from "@/lib/utils";

type InflaraLogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  withWordmark?: boolean;
  compactWordmark?: boolean;
};

export function InflaraLogo({
  className,
  markClassName,
  wordmarkClassName,
  withWordmark = true,
  compactWordmark = false,
}: InflaraLogoProps) {
  const gradientId = useId().replace(/:/g, "");
  const warmId = `${gradientId}-warm`;
  const coolId = `${gradientId}-cool`;
  const bgId = `${gradientId}-bg`;

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className={cn("h-11 w-11 shrink-0", markClassName)}
      >
        <defs>
          <linearGradient id={bgId} x1="10" x2="56" y1="8" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#111728" />
            <stop offset="1" stopColor="#0B1020" />
          </linearGradient>
          <linearGradient
            id={warmId}
            x1="18"
            x2="34"
            y1="16"
            y2="38"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF6A61" />
            <stop offset="1" stopColor="#FF9F55" />
          </linearGradient>
          <linearGradient
            id={coolId}
            x1="30"
            x2="48"
            y1="26"
            y2="50"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#58A8FF" />
            <stop offset="1" stopColor="#4F64FF" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="18" fill={`url(#${bgId})`} />
        <path
          d="M18 22.2c0-4.64 3.76-8.4 8.4-8.4H32v11.95h-5.6a4.55 4.55 0 0 1-4.55-4.55Z"
          fill={`url(#${warmId})`}
        />
        <path
          d="M32 38.25h5.6c4.64 0 8.4 3.76 8.4 8.4V50.2H40.4a8.4 8.4 0 0 1-8.4-8.4v-3.55Z"
          fill={`url(#${coolId})`}
        />
        <rect x="28" y="12" width="8" height="40" rx="4" fill="#F8FAFC" />
        <circle cx="32" cy="32" r="18" fill="none" opacity="0.12" stroke="#F8FAFC" />
      </svg>

      {withWordmark ? (
        <span
          className={cn(
            "text-lg font-semibold tracking-[-0.05em] text-[var(--foreground-strong)]",
            compactWordmark && "text-base",
            wordmarkClassName,
          )}
        >
          Inflara
        </span>
      ) : null}
    </span>
  );
}
