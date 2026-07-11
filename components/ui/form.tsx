"use client";

import {
  Children,
  cloneElement,
  forwardRef,
  Fragment,
  InputHTMLAttributes,
  isValidElement,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useId,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const baseControl =
  "w-full rounded-2xl glass-input px-3.5 py-3 text-white placeholder:text-white/35 outline-none disabled:opacity-50";

export const invalidControl =
  "border-rose-400/70 focus:border-rose-400 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.3)]";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const autoId = useId();
  // When the Field wraps exactly one element and no explicit htmlFor is given,
  // wire the association automatically: the label points at the control, and
  // the control gets aria-describedby/aria-invalid for its error text. Fields
  // wrapping several controls keep the old unwired behavior (a shared id
  // would be ambiguous) — pass htmlFor/id explicitly there.
  const only =
    !htmlFor && Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const injectable =
    isValidElement(only) && only.type !== Fragment
      ? (only as ReactElement<Record<string, unknown>>)
      : null;
  const controlId =
    htmlFor ?? ((injectable?.props.id as string | undefined) ?? autoId);
  const errorId = error ? `${controlId}-error` : undefined;
  const content = injectable
    ? cloneElement(injectable, {
        id: injectable.props.id ?? controlId,
        "aria-describedby": injectable.props["aria-describedby"] ?? errorId,
        "aria-invalid":
          injectable.props["aria-invalid"] ?? (error ? true : undefined),
      })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor ?? (injectable ? controlId : undefined)}
          className="block text-sm font-medium text-white/80"
        >
          {label}
          {required && <span className="ml-0.5 text-rose-400">*</span>}
        </label>
      )}
      {content}
      {error ? (
        <p id={errorId} className="text-xs font-medium leading-relaxed text-rose-300">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-white/40">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(baseControl, invalid && invalidControl, className)}
      {...rest}
    />
  ),
);
TextInput.displayName = "TextInput";

/** Password field with a built-in show/hide toggle (eye button). */
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  invalid?: boolean;
};
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, invalid, ...rest }, ref) => {
    const { t } = useI18n();
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn(baseControl, "pr-11", invalid && invalidControl, className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t.ui.hidePassword : t.ui.showPassword}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-2xl text-white/40 outline-none transition-colors hover:text-white/80 focus-visible:text-white"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(baseControl, "min-h-24 resize-y", invalid && invalidControl, className)}
      {...rest}
    />
  ),
);
Textarea.displayName = "Textarea";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn(baseControl, "appearance-none pr-10", invalid && invalidControl, className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.75rem center",
        backgroundSize: "1.1rem",
      }}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-3"
    >
      {label && <span className="text-sm font-medium text-white/80">{label}</span>}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400/60",
          checked ? "bg-brand-600" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </label>
  );
}

/** One checkbox recipe (h-4 w-4 · accent-brand-500) + inline label, so every
 *  admin checklist renders identical boxes. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-2.5",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded accent-brand-500"
      />
      {label && <span className="text-sm text-white/80">{label}</span>}
    </label>
  );
}

/** Segmented control (e.g. ค.ศ./พ.ศ., สมัครให้ตัวเอง/กลุ่ม). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-1",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-brand-400/60",
            value === o.value
              ? "bg-white/15 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)]"
              : "text-white/50 hover:text-white/80",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
