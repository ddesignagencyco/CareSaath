"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, type ButtonProps } from "./ui/button";
import { Field, Textarea } from "./ui/field";
import { Modal } from "./ui/overlay";

/**
 * Confirmation dialog with a free-text reason/note. Every admin decision is
 * audit-logged by the API, so the note is offered on all of them.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label,
  placeholder,
  required,
  minLength = required ? 3 : 0,
  maxLength = 1000,
  confirmLabel,
  confirmVariant = "primary",
  loading,
  onConfirm,
  children,
  withReason = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  label?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  confirmLabel: string;
  confirmVariant?: ButtonProps["variant"];
  loading?: boolean;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
  /** False for actions whose API takes no note (e.g. reactivate). */
  withReason?: boolean;
}) {
  const [reason, setReason] = useState("");
  const t = useTranslations();
  const tooShort = withReason && reason.trim().length < minLength;

  function close() {
    setReason("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant={confirmVariant}
            loading={loading}
            disabled={tooShort}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        {withReason && (
        <Field
          label={label ?? t("shared.reason.label")}
          required={required}
          hint={t(required ? "shared.reason.counter" : "shared.reason.counterOptional", { count: reason.length, max: maxLength })}
        >
          {(id) => (
            <Textarea
              id={id}
              value={reason}
              maxLength={maxLength}
              placeholder={placeholder}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        )}
      </div>
    </Modal>
  );
}
