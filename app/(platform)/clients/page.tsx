import Link from "next/link";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ClientsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission({ permission: Permission.PROJECT_READ });

  const params = await searchParams;
  const qParam = params.q;
  const q = typeof qParam === "string" ? qParam.trim() : "";

  const { page, pageSize, skip, take } = parsePagination(params);

  const where = q
    ? {
        OR: [
          { clientCode: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.client.count({ where }),
  ]);

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  const hrefForPage = (n: number) => buildPageHref("/clients", baseParams, n, pageSize);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">System</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">Clients</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Client master register (used for projects, quotations, contracts and invoices).
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          New Project
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Search
            </label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by client code, name, email, phone"
              className="mt-2 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            />
          </div>
          <div className="flex items-center gap-2 pt-6 sm:pt-0">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Search
            </button>
            <Link
              href="/clients"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {clients.length === 0 ? (
          <div className="p-6 text-sm text-neutral-600">No clients found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Client Code</th>
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Email</th>
                  <th className="px-4 py-3 text-left font-semibold">Phone</th>
                  <th className="px-4 py-3 text-left font-semibold">Created</th>
                  <th className="px-4 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">{c.clientCode}</td>
                    <td className="px-4 py-3 text-neutral-900">{c.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{c.email ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">{c.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects?q=${encodeURIComponent(c.name)}`}
                        className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                      >
                        View projects
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-neutral-200 px-4 py-4">
          <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </section>
    </main>
  );
}

