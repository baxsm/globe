"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FC, useState } from "react";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import CommandTrigger from "./command-trigger";

/**
 * The pinned guidance version is permanent furniture, not a settings detail.
 *
 * What a filing is being read against decides whether a finding means anything, so it
 * sits in the chrome on every page. It reads from the prefetched query, so it is
 * present in the server-rendered HTML rather than appearing a moment after hydration.
 */
const Topbar: FC<{ email: string }> = ({ email }) => {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const { data: reference } = useSuspenseQuery({
    queryKey: queryKeys.referenceSchema,
    queryFn: () => api.referenceSchema(),
  });

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await api.logout();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Try again.");
      setSigningOut(false);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-border border-b bg-surface px-4 sm:px-6">
      <CommandTrigger />

      <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
        {/*
          The pinned versions never drop out, only shorten.
          What a filing is read against decides whether a finding means anything, so
          hiding it on a narrow screen would leave the one fact the chrome exists to
          carry visible on desktop only. The labels go; the values stay.
        */}
        <dl className="flex min-w-0 items-baseline gap-x-2">
          <dt className="hidden font-mono text-micro text-text-faint uppercase tracking-[0.14em] sm:block">
            Guidance
          </dt>
          <dd className="truncate font-mono text-text-muted text-xs">
            {reference.guidanceApproved}
          </dd>
          <dt className="hidden font-mono text-micro text-text-faint uppercase tracking-[0.14em] sm:ml-2 sm:block">
            Schema
          </dt>
          <dd className="hidden truncate font-mono text-text-muted text-xs sm:block">
            {reference.schemaVersion}
          </dd>
        </dl>

        <span className="hidden truncate font-mono text-text-faint text-xs md:inline">{email}</span>

        <Button
          aria-label="Sign out"
          disabled={signingOut}
          onClick={onSignOut}
          size="icon"
          variant="ghost"
        >
          <LogOut aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
    </header>
  );
};

export default Topbar;
