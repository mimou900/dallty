import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Canonical confirmation/short-form dialog (brief §25). Reserved for
 * confirmations and short forms — never a multi-step workflow (use
 * AdminDrawer for that).
 */
const AdminDialog = DialogPrimitive.Root;
const AdminDialogTrigger = DialogPrimitive.Trigger;
const AdminDialogPortal = DialogPrimitive.Portal;
const AdminDialogClose = DialogPrimitive.Close;

const AdminDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-(--z-overlay) bg-primary/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
AdminDialogOverlay.displayName = "AdminDialogOverlay";

const AdminDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AdminDialogPortal>
    <AdminDialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-(--z-overlay) grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-elevation-high duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:p-7",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Close"
        className="absolute right-5 top-5 grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </AdminDialogPortal>
));
AdminDialogContent.displayName = "AdminDialogContent";

const AdminDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-1.5 pr-8", className)} {...props} />
);

const AdminDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);

const AdminDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-h3", className)} {...props} />
));
AdminDialogTitle.displayName = "AdminDialogTitle";

const AdminDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-body-sm text-muted-foreground", className)}
    {...props}
  />
));
AdminDialogDescription.displayName = "AdminDialogDescription";

export {
  AdminDialog,
  AdminDialogTrigger,
  AdminDialogPortal,
  AdminDialogClose,
  AdminDialogOverlay,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogFooter,
  AdminDialogTitle,
  AdminDialogDescription,
};
