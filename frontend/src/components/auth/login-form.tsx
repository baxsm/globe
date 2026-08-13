"use client";

import { useRouter } from "next/navigation";
import { type FC, type FormEvent, useState } from "react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Loader from "@/components/ui/loader";
import { ApiError, api } from "@/lib/api";

/**
 * The sign-in screen states what the product is for before asking for a password.
 *
 * The left panel carries the thesis rather than a logo. Someone arriving here needs to
 * know which schema and which guidance the tool reads a filing against, because that is
 * the whole claim it makes.
 */
const LoginForm: FC = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  /**
   * Held separately from a form library's own submitting flag.
   *
   * A successful sign-in navigates, and the router transition outlives the promise. A
   * flag that resets when the request settles leaves the button live during the
   * transition, which is long enough to submit a second time.
   */
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      await api.login(email, password);
      router.replace("/returns");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in. Try again.");
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      {/*
        The thesis panel takes the paper ground and the form takes the white sheet, so
        the sheet is the thing being written on. Reversed, the form reads as the
        background and the prose as the card sitting on top of it.
      */}
      <section className="relative hidden flex-col justify-center gap-16 border-border border-r bg-ground px-12 py-14 lg:flex xl:px-16">
        <p className="absolute top-14 left-12 font-mono text-micro text-text-faint uppercase tracking-[0.18em] xl:left-16">
          GloBE Information Return
        </p>

        <div className="max-w-lg">
          <h1 className="text-pretty font-normal text-4xl leading-[1.15] tracking-[-0.015em]">
            A schema-valid GIR is not a correct GIR.
          </h1>

          <p className="mt-6 text-lg text-text-muted leading-relaxed">
            The OECD published the GIR XML schema in January 2025, then published guidance recording
            fourteen defects in it. Four of those are validation rules that must not be applied,
            because applying them rejects correct filings.
          </p>

          <p className="mt-4 text-lg text-text-muted leading-relaxed">
            This tool prepares the return, applies the fourteen corrections, and marks each one in
            the margin against the element it changed.
          </p>

          {/*
            A worked example rather than a description of one. It is the smallest thing that
            shows what a margin annotation does, and it uses the real substitution: an Article
            7.1.2 basis has no element, so the schema's 7.2.2 code is written instead.
          */}
          <figure className="mt-10 border-border border-t pt-6">
            <figcaption className="font-mono text-micro text-text-faint uppercase tracking-[0.18em]">
              Issue 2, paragraphs 3-8
            </figcaption>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-sm">
              <span className="text-ink-struck line-through decoration-ink-struck/60">
                Article 7.1.2
              </span>
              <span aria-hidden="true" className="text-text-faint">
                &rarr;
              </span>
              <span className="text-ink-applied">GIR1910</span>
            </div>

            <p className="mt-3 text-sm text-text-muted leading-relaxed">
              The basis the return needs does not exist in the schema. The errata requires the
              Article 7.2.2 code in its place, with the real basis carried alongside it.
            </p>
          </figure>
        </div>

        <p className="absolute bottom-14 left-12 font-mono text-micro text-text-faint xl:left-16">
          Schema GLOBEXML_v1.0 &middot; Guidance 3 June 2026
        </p>
      </section>

      <section className="flex items-center justify-center bg-surface px-6 py-16">
        <div className="w-full max-w-sm">
          <h2 className="font-normal text-2xl tracking-[-0.01em]">Sign in</h2>
          <p className="mt-2 text-sm text-text-muted">Continue to your returns.</p>

          {/*
            `noValidate` hands validation to the handler. Without it the browser's own
            bubble on `type="email"` fires first and the form never reaches this code.
          */}
          <form className="mt-8 space-y-5" noValidate onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="block font-medium text-sm" htmlFor="email">
                Email
              </label>
              <Input
                autoComplete="username"
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div className="space-y-2">
              <label className="block font-medium text-sm" htmlFor="password">
                Password
              </label>
              <Input
                autoComplete="current-password"
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>

            {error !== null && (
              <p className="text-ink-struck text-sm" role="alert">
                {error}
              </p>
            )}

            <Button className="w-full" disabled={pending} size="lg" type="submit">
              {pending && <Loader className="size-3.5" />}
              {pending ? "Signing in" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
};

export default LoginForm;
