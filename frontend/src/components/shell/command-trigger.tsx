"use client";

import { Search } from "lucide-react";
import { type FC, useEffect, useState } from "react";
import { setPaletteOpen } from "./command-store";

/**
 * Shows the real shortcut for the platform.
 *
 * The label is resolved after mount because `navigator` does not exist during the
 * server render. Rendering the mac glyph on the server and swapping it on the client
 * is a hydration mismatch; starting from the ctrl form and correcting it is not.
 */
const CommandTrigger: FC = () => {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.userAgent));
  }, []);

  return (
    // The label is the button's only text, and it is hidden below `sm`, so without an
    // explicit name this is an unnamed button on every route at phone width. axe rates
    // that critical and a screen reader announces "button".
    <button
      aria-label="Jump to a return"
      className="flex h-8 cursor-pointer items-center gap-2 rounded-sheet border border-border bg-ground px-2.5 text-text-faint text-xs transition-colors hover:border-border-strong hover:text-text-muted sm:min-w-56"
      onClick={() => setPaletteOpen(true)}
      type="button"
    >
      <Search aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="hidden sm:inline">Jump to a return</span>
      <kbd className="ml-auto hidden font-mono text-micro sm:inline">{isMac ? "⌘" : "Ctrl"} K</kbd>
    </button>
  );
};

export default CommandTrigger;
