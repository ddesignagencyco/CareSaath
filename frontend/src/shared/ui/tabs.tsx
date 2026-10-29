"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type ComponentProps } from "react";
import { cn } from "./cn";

/** Accessible tabs (Radix): roving focus, arrow-key nav, aria wiring. */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex items-center gap-1 rounded-xl bg-ink-50 p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-500 transition-colors data-[state=active]:bg-white data-[state=active]:text-ink-900 data-[state=active]:shadow-card focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 focus-visible:outline-none", className)} {...props} />;
}
