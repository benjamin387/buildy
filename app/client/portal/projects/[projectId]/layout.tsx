import Link from "next/link";
import { requireClientPortalProject } from "@/lib/client-portal/auth";

export const dynamic = "force-dynamic";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function TabLink(props: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={props.href}
      className={cx(
        "inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border px-4 text-sm font-semibold shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-slate-200 bg-white text-neutral-900 hover:bg-stone-50",
      )}
    >
      {props.label}
    </Link>
  );
}

export default async function ClientPortalProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const access = await requireClientPortalProject({ projectId });

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/client/portal" className="text-sm font-semibold text-neutral-900 hover:underline">
              ← Back to projects
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">
              {access.project.name}
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              {access.project.siteAddress || access.project.addressLine1 || "-"} ·{" "}
              <span className="font-semibold text-neutral-900">{access.project.status}</span>
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabLink href={`/client/portal/projects/${projectId}`} label="Overview" />
            <TabLink href={`/client/portal/projects/${projectId}/presentation`} label="Presentation" />
            <TabLink href={`/client/portal/projects/${projectId}/quotation`} label="Quotation" />
            <TabLink href={`/client/portal/projects/${projectId}/contract`} label="Contract" />
            <TabLink href={`/client/portal/projects/${projectId}/invoices`} label="Invoices" />
            <TabLink href={`/client/portal/projects/${projectId}/progress`} label="Progress" />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
