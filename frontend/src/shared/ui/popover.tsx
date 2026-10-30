"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { type ComponentProps } from "react";
import { cn } from "./cn";

/** Accessible popover (Radix): outside-click + Escape dismissal, focus management. */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className, align = "center", sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 w-72 rounded-xl border border-ink-100 bg-white p-3 shadow-pop focus:outline-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
