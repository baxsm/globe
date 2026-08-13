import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ReturnNotFound = () => (
  <div className="mx-auto w-full max-w-lg px-4 py-24 text-center sm:px-8">
    <h1 className="font-normal text-2xl tracking-[-0.015em]">No such return</h1>

    <p className="mt-3 text-text-muted leading-relaxed">
      It may have been deleted, or it belongs to another account.
    </p>

    {/*
      The button styles come from the same `cva` every button uses, so this link presses
      like one. Hand-writing the classes here had already drifted: it carried a bare
      opacity hover and none of the press state.
    */}
    <Link className={cn(button({ variant: "primary" }), "mt-6")} href="/returns">
      <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
      Back to returns
    </Link>
  </div>
);

export default ReturnNotFound;
