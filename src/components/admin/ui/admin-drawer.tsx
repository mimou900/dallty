import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Contextual entity detail / forms / filters / security flows (brief §24).
 * Single component, responsive by CSS rather than by side-swapping props:
 * mobile gets a bottom sheet (`inset-x-0 bottom-0`, rounded top corners,
 * capped height), sm: and up become a right-side drawer — matching the
 * brief's "Desktop -> side drawer, iPad -> side/large sheet, Mobile ->
 * full-height/bottom sheet" spec from one definition.
 */
const AdminDrawer = DialogPrimitive.Root;
const AdminDrawerTrigger = DialogPrimitive.Trigger;
const AdminDrawerPortal = DialogPrimitive.Portal;
const AdminDrawerClose = DialogPrimitive.Close;

const AdminDrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-(--z-drawer) bg-primary/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
AdminDrawerOverlay.displayName = "AdminDrawerOverlay";

const AdminDrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AdminDrawerPortal>
    <AdminDrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-(--z-drawer) flex flex-col gap-0 border border-border/60 bg-card shadow-elevation-high outline-none",
        // Mobile: bottom sheet.
        "inset-x-0 bottom-0 top-auto max-h-[88vh] rounded-t-4xl",
        "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // sm and up: right-side drawer.
        "sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:top-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-l-4xl sm:rounded-t-none",
        "sm:data-[state=closed]:slide-out-to-right sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-bottom-0",
        "duration-(--motion-emphasis) data-[state=open]:animate-in data-[state=closed]:animate-out",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden"
      />
      {children}
      <DialogPrimitive.Close
        aria-label="Close"
        className="absolute right-5 top-5 grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </AdminDrawerPortal>
));
AdminDrawerContent.displayName = "AdminDrawerContent";

const AdminDrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("shrink-0 border-b border-border/60 px-6 py-5 pr-14", className)} {...props} />
);

const AdminDrawerBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)} {...props} />
);

const AdminDrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 px-6 py-4 sm:flex-row sm:justify-end",
      className,
    )}
    {...props}
  />
);

const AdminDrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-h3", className)} {...props} />
));
AdminDrawerTitle.displayName = "AdminDrawerTitle";

const AdminDrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-body-sm mt-1 text-muted-foreground", className)}
    {...props}
  />
));
AdminDrawerDescription.displayName = "AdminDrawerDescription";

/** A full-bleed loading fill for the body slot while drawer content resolves. */
function AdminDrawerLoading() {
  return (
    <div className="grid min-h-40 place-items-center" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}

export {
  AdminDrawer,
  AdminDrawerTrigger,
  AdminDrawerPortal,
  AdminDrawerClose,
  AdminDrawerOverlay,
  AdminDrawerContent,
  AdminDrawerHeader,
  AdminDrawerBody,
  AdminDrawerFooter,
  AdminDrawerTitle,
  AdminDrawerDescription,
  AdminDrawerLoading,
};
