import { prisma } from "@/lib/prisma";
import { bootstrapAdmin } from "@/app/(auth)/setup/actions";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    const user = await getSessionUser();
    redirect(user ? "/projects" : "/login");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-16">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Initial Setup
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Create Admin Account
          </h1>
          <p className="text-sm leading-6 text-neutral-300">
            This runs once. After an admin exists, this page is disabled.
          </p>
        </div>

        <form
          action={bootstrapAdmin}
          className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-lg"
        >
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-200">Name</span>
              <input
                name="name"
                required
                className="h-11 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Admin"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-200">Email</span>
              <input
                name="email"
                type="email"
                required
                className="h-11 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none ring-neutral-400 focus:ring-2"
                placeholder="admin@company.com"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-200">Password</span>
              <input
                name="password"
                type="password"
                minLength={8}
                required
                className="h-11 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none ring-neutral-400 focus:ring-2"
                placeholder="At least 8 characters"
              />
            </label>

            <button className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200">
              Create Admin
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
