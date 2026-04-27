"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginWithPassword } from "@/app/(auth)/login/actions";

type LoginActionState = {
  error: string;
};

export function LoginForm(props: { callbackUrl: string }) {
  const initialLoginState: LoginActionState = {
    error: "",
  };

  const [state, formAction, pending] = useActionState(
    loginWithPassword,
    initialLoginState,
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-16">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Interior Design Platform
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm leading-6 text-neutral-300">
            Use your internal account to access projects, quotations, contracts,
            invoices, and P&amp;L dashboards.
          </p>
        </div>

        <form
          action={formAction}
          className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-lg"
        >
          <div className="grid gap-4">
            <input type="hidden" name="callbackUrl" value={props.callbackUrl} />

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-200">Email</span>
              <input
                name="email"
                type="email"
                required
                className="h-11 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none ring-neutral-400 focus:ring-2"
                placeholder="name@company.com"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-200">Password</span>
              <input
                name="password"
                type="password"
                required
                className="h-11 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none ring-neutral-400 focus:ring-2"
                placeholder="••••••••"
              />
            </label>

            {state.error ? (
              <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {state.error}
              </p>
            ) : null}

            <button
              disabled={pending}
              type="submit"
              className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <div className="text-sm text-neutral-400">
          <p>
            First time setup?{" "}
            <Link href="/setup" className="text-white underline">
              Create the initial admin
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
