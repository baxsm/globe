import type { FC, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * One text field, so focus and invalid look the same on every form. Mono because every
 * value typed here is an identifier, a date or a schema code, read character by
 * character.
 *
 * Focus darkens the border and keeps the global ring. Swapping the ring for a coloured
 * border is the common version of this component and leaves keyboard users with nothing;
 * a blue border would borrow `ink-applied`, which means "the errata wrote this".
 */
const Input: FC<InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    className={cn(
      "h-10 w-full rounded-sheet border border-border bg-ground px-3 font-mono text-sm transition-colors duration-150",
      "placeholder:text-text-faint hover:border-border-strong focus:border-text",
      "aria-[invalid=true]:border-ink-struck",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
);

export default Input;
