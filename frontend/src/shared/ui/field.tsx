import clsx from "clsx";
import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

const CONTROL =
  "w-full rounded-lg border border-ink-200 bg-white text-sm text-ink-900 placeholder:text-ink-400 shadow-card transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-ink-50 disabled:text-ink-500";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(CONTROL, "h-10 px-3", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(CONTROL, "min-h-24 px-3 py-2.5 leading-relaxed", className)} {...rest} />;
}

/** Label + control + hint/error. Pass a render function to get the generated id. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-800">
        {label}
        {required && <span className="ms-0.5 text-danger-600">*</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs font-medium text-danger-600">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-500">{hint}</p>
      )}
    </div>
  );
}
