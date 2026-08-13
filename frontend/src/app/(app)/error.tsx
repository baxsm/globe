"use client";

import type { FC } from "react";
import Button from "@/components/ui/button";

/**
 * An error state, kept apart from an empty one.
 *
 * A failed fetch that fell through to an empty list would read as "you have no
 * returns", which is a different and much worse claim than "this did not load".
 */
const AppError: FC<{ error: Error; reset: () => void }> = ({ error, reset }) => (
  <div className="mx-auto w-full max-w-lg px-4 py-24 text-center sm:px-8">
    <h1 className="font-normal text-2xl tracking-[-0.015em]">Could not load this page</h1>

    <p className="mt-3 text-text-muted leading-relaxed">
      {error.message.length > 0 ? error.message : "Something went wrong reading from the API."}
    </p>

    <Button className="mt-6" onClick={reset}>
      Try again
    </Button>
  </div>
);

export default AppError;
