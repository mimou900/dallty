import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const AdminTabs = TabsPrimitive.Root;

const AdminTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex min-h-12 items-center gap-1 rounded-2xl bg-secondary p-1.5 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
AdminTabsList.displayName = "AdminTabsList";

/** Active state is unmistakable (brief §23): a solid card fill + shadow, not
    just a color shift. */
const AdminTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl px-4 text-label outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-elevation-low",
      className,
    )}
    {...props}
  />
));
AdminTabsTrigger.displayName = "AdminTabsTrigger";

const AdminTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
AdminTabsContent.displayName = "AdminTabsContent";

export { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent };
