"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { type ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Confirmation dialog (Radix AlertDialog): focus trap, Escape, overlay click.
 * Use `open`/`onOpenChange` (controlled) with plain `Button`s inside the footer —
 * the project `Button` isn't a forwardRef, so we don't use Radix `asChild`.
 */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function AlertDialogContent({ className, children, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm" />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-100 bg-white p-6 shadow-pop focus:outline-none rtl:translate-x-1/2",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("space-y-1.5", className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn("text-lg font-extrabold text-ink-900", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn("text-sm leading-relaxed text-ink-600", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
