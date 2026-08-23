import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Canonical Super Admin button (design-system Phase 01, brief §19). Bigger
 * than the shadcn default (`h-9`) — the Phase 00 audit found platform pages
 * hand-rolling `min-h-10` through `min-h-12` buttons for the same
 * conceptual role; this is the one shared definition that replaces all of
 * them. `size="icon"` covers what a separate AdminIconButton would have
 * been — one component, not two near-duplicates.
 */
const adminButtonVariants = cva(
  "press inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-button font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* Deep-green structural action — the default for admin surfaces
           (Phase 00 §5: the Super Admin should not read as "lime everywhere").
           Subtle same-hue gradient + colored shadow (visual-direction-c,
           approved) — depth cue only, no glass/blur/shine. */
        primary:
          "bg-(image:--gradient-primary) text-primary-foreground shadow-(--shadow-glow-primary) hover:brightness-105 active:brightness-95",
        /* Reserved for the single highest-energy CTA on a screen. */
        lime: "bg-(image:--gradient-lime) text-lime-foreground shadow-(--shadow-glow-lime) hover:brightness-105 active:brightness-95",
        accent: "bg-pink text-pink-foreground hover:bg-pink/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-border bg-card hover:bg-secondary",
        ghost: "hover:bg-secondary text-foreground",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-sm",
        lg: "h-14 px-7 text-base",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface AdminButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof adminButtonVariants> {
  asChild?: boolean;
  /** Shows a spinner in place of the leading icon and disables the button. */
  loading?: boolean;
}

const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(adminButtonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {children}
      </Comp>
    );
  },
);
AdminButton.displayName = "AdminButton";

export { AdminButton, adminButtonVariants };
