import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildPublicUrlForDocument } from "@/lib/messaging/public-links";
import type { PublicDocumentType } from "@prisma/client";
import { generatePublicDocumentLinkAction } from "@/app/(platform)/messaging/actions";
import { CopyLinkButton } from "@/app/(platform)/components/copy-link-button";

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export async function ClientDeliveryActions(props: {
  returnTo: string;
  projectId?: string | null;
  documentType: PublicDocumentType;
  documentId: string;
  deliveryToken?: string | null;
}) {
  const tokenFromQuery = props.deliveryToken?.trim() ? props.deliveryToken.trim() : null;
  const now = new Date();

  const link =
    (tokenFromQuery
      ? await prisma.publicDocumentLink.findUnique({ where: { token: tokenFromQuery } })
      : await prisma.publicDocumentLink.findFirst({
          where: {
            documentType: props.documentType,
            documentId: props.documentId,
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: [{ createdAt: "desc" }],
        })) ?? null;

  const url = link ? buildPublicUrlForDocument({ documentType: link.documentType, token: link.token }) : null;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-neutral-950">Client Delivery</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Generate a secure link for the client, preview the client view, and then send via Email/WhatsApp below.
        </p>
      </div>

      <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Secure link</p>
          {url ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={url}
                  className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none"
                />
              </div>
              <p className="text-xs text-neutral-500">
                Created {formatDateTime(link?.createdAt)} · Viewed {formatDateTime(link?.viewedAt)} · Expires{" "}
                {formatDateTime(link?.expiresAt)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-neutral-700">No active link yet. Generate one to share with the client.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {url ? (
            <>
              <Link
                href={url}
                target="_blank"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Preview client view
              </Link>
              <CopyLinkButton text={url} label="Copy link" />
            </>
          ) : null}

          <form action={generatePublicDocumentLinkAction}>
            <input type="hidden" name="returnTo" value={props.returnTo} />
            <input type="hidden" name="projectId" value={props.projectId ?? ""} />
            <input type="hidden" name="documentType" value={props.documentType} />
            <input type="hidden" name="documentId" value={props.documentId} />
            <input type="hidden" name="expiresInDays" value="14" />
            <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              {url ? "Generate new link" : "Generate link"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
