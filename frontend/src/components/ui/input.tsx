import type { FC, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * One text field, so focus and invalid look the same on every form.
 *
 * Mono by default. Every value a filer types here is an identifier, a date or a code
 * from the schema, and those are read character by character rather than as words.
 *
 * The focus treatment is a border colour change plus the global focus ring, not a
 * removed outline. Dropping the outline for a coloured border alone is the common
 * version of this component and it leaves keyboard users with no visible focus at all.
 */
const Input: FC<InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    className={cn(
      "h-10 w-full rounded-sheet border border-border bg-ground px-3 font-mono text-sm transition-colors duration-150",
      "placeholder:text-text-faint hover:border-border-strong focus:border-ink-applied",
      "aria-[invalid=true]:border-ink-struck",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
);

export default Input;
