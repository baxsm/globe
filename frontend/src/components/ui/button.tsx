import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, FC } from "react";
import { cn } from "@/lib/utils";

/**
 * Every button in the product, so a press feels the same everywhere.
 *
 * Written by hand rather than taken from a component library: the whole set is three
 * variants and the token layer would have been replaced regardless. What matters here
 * is that the states are complete. A button with a hover but no press state reads as
 * an image of a button, and that gap is invisible in a screenshot.
 *
 * `active:translate-y-px` is the press. One pixel is enough to register as a physical
 * response at the moment of click and small enough not to reflow the row it sits in.
 */
const button = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sheet font-medium text-sm transition-[background-color,color,border-color,opacity,translate] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:active:translate-y-0",
  {
    variants: {
      variant: {
        /** The one action a screen is for. At most one per view. */
        primary: "bg-text text-ground hover:bg-text/90",
        /** Everything else that is still a real action. */
        secondary:
          "border border-border bg-surface text-text hover:border-border-strong hover:bg-sunk",
        /** Chrome-level controls, where a border would add a box to the furniture. */
        ghost: "text-text-muted hover:bg-sunk hover:text-text",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-4",
        /** Square, for a single icon. */
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

const Button: FC<ButtonProps> = ({ className, variant, size, type = "button", ...props }) => (
  // `type` defaults to "button". A bare <button> inside a form submits it, which turns
  // a cancel control into a save the first time someone presses enter.
  <button className={cn(button({ variant, size }), className)} type={type} {...props} />
);

export { button };
export default Button;
