"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Accessible modal built on Radix (focus trap, Escape, scroll lock), themed to
 * the CareSaath tokens. The first shadcn-style primitive — new modals use this;
 * existing `Modal` usages migrate over incrementally.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-100 bg-white p-6 shadow-pop focus:outline-none rtl:translate-x-1/2",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute end-4 top-4 rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mb-4 space-y-1 pe-6", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-extrabold text-ink-900", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-ink-500", className)} {...props} />;
}
