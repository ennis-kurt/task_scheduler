export const clerkAuthAppearance = {
  options: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full border-none bg-transparent shadow-none",
    card: "border-none bg-transparent p-0 shadow-none",
    header: "!hidden",
    headerTitle: "!hidden",
    headerSubtitle: "!hidden",
    socialButtonsRoot: "!hidden",
    socialButtons: "!hidden",
    socialButtonsBlockButton: "!hidden",
    socialButtonsIconButton: "!hidden",
    dividerRow: "!hidden",
    dividerLine: "!hidden",
    dividerText: "!hidden",
    formFieldLabel:
      "mb-2 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted-foreground)]",
    formFieldInput:
      "h-12 rounded-2xl border border-[var(--border-strong)] bg-[var(--input-bg)] px-4 text-[15px] text-[var(--foreground-strong)] shadow-none transition focus:border-[rgba(79,100,255,0.45)] focus:bg-[var(--surface-elevated)] focus:ring-0",
    formFieldInputShowPasswordButton:
      "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
    formButtonPrimary:
      "mt-2 h-12 rounded-2xl border-0 bg-[var(--button-solid-bg)] text-[15px] font-medium text-[var(--button-solid-fg)] shadow-none transition hover:bg-[var(--button-solid-hover)]",
    formFieldAction:
      "text-sm font-medium text-[var(--muted-foreground)] transition hover:text-[var(--foreground-strong)]",
    footerActionText: "text-sm text-[var(--muted-foreground)]",
    footerActionLink:
      "font-medium text-[var(--foreground-strong)] underline-offset-4 transition hover:text-[var(--foreground)] hover:underline",
    alert:
      "rounded-2xl border border-[rgba(225,29,72,0.18)] bg-[rgba(225,29,72,0.06)] text-[var(--foreground)] shadow-none",
    alertText: "text-sm leading-6 text-[var(--foreground)]",
    alertClerkError: "text-[var(--foreground)]",
    otpCodeFieldInput:
      "h-12 w-12 rounded-2xl border border-[var(--border-strong)] bg-[var(--input-bg)] text-[var(--foreground-strong)] shadow-none",
    formResendCodeLink:
      "text-sm font-medium text-[var(--foreground-strong)] underline-offset-4 hover:underline",
    identityPreviewText: "text-sm text-[var(--foreground-strong)]",
    identityPreviewEditButton:
      "text-sm font-medium text-[var(--muted-foreground)] transition hover:text-[var(--foreground-strong)]",
  },
} as const;
