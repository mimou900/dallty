import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select as SelectRoot,
  SelectGroup,
  SelectValue,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";

/**
 * Customer-facing themed Select — same shadcn/Radix primitive the admin side's
 * AdminSelect wraps, styled to match this app's own input language (rounded-2xl,
 * bg-card/70, ring-ring focus) instead of the admin's flatter card style, and its
 * dropdown in the glass treatment used everywhere else in the customer UI.
 */
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl bg-card/70 px-4 text-base text-foreground outline-none ring-ring transition-colors data-[placeholder]:text-muted-foreground focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 shrink-0 opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "DalltySelectTrigger";

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        "relative z-(--z-overlay) max-h-(--radix-select-content-available-height) min-w-[10rem] overflow-y-auto overflow-x-hidden rounded-3xl glass p-1.5 shadow-elevation-medium data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "DalltySelectContent";

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex min-h-11 w-full cursor-pointer select-none items-center rounded-2xl py-2 pl-3 pr-9 text-base font-semibold outline-none focus:bg-primary/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute right-3 flex size-4 items-center justify-center text-primary">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "DalltySelectItem";

export {
  SelectRoot as Select,
  SelectGroup,
  SelectValue,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectContent,
  SelectItem,
};
