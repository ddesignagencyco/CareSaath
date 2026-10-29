"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Accessible tooltip (Radix). Needs a `TooltipProvider` ancestor — wrap the app
 * (or a subtree) once; `delayDuration` on the provider tunes hover delay.
 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 max-w-xs rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-pop", className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
