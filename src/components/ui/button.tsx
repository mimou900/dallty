import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /*
         * Primary/lime get a subtle two-stop same-hue gradient + a soft
         * colored shadow (visual-direction-c, approved) — depth cues only,
         * explicitly NOT glass/blur/shine: no backdrop-filter, no gradient
         * sweep, no highlight overlay. Every other variant stays a flat
         * solid fill, unchanged. Hover/active adjust brightness + the
         * shadow's lift, never the fill itself, so the gradient never
         * looks like it's "shining."
         */
        default:
          "bg-(image:--gradient-primary) text-primary-foreground shadow-(--shadow-glow-primary) hover:brightness-105 active:brightness-95",
        /* Brand "Primary Button" — lime, for the highest-energy CTA on a screen
           (Book Now / Continue / Confirm / Save). Not the default variant: most
           existing `variant="default"` call sites are dashboard/admin actions
           that should stay on the structural deep-green, not turn lime. */
        lime: "bg-(image:--gradient-lime) text-lime-foreground shadow-(--shadow-glow-lime) hover:brightness-105 active:brightness-95",
        /* Brand "Accent Button" — pink, flat solid (unchanged — only primary/lime get the gradient treatment). */
        accent: "bg-pink text-pink-foreground shadow hover:bg-pink/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
