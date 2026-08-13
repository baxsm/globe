import Link from "next/link";

const ReturnNotFound = () => (
  <div className="mx-auto w-full max-w-lg px-4 py-24 text-center sm:px-8">
    <h1 className="font-normal text-2xl tracking-[-0.015em]">No such return</h1>

    <p className="mt-3 text-text-muted leading-relaxed">
      It may have been deleted, or it belongs to another account.
    </p>

    <Link
      className="mt-6 inline-flex h-9 items-center rounded-sheet bg-text px-4 font-medium text-ground text-sm transition-opacity hover:opacity-90"
      href="/returns"
    >
      Back to returns
    </Link>
  </div>
);

export default ReturnNotFound;
