import { notFound } from "next/navigation";
import { getContractSignatureStatus } from "@/lib/contracts/signature-engine";
import { prisma } from "@/lib/prisma";
import { ContractPortalSignClient } from "@/app/client/[token]/contract/sign/sign-client";

export const dynamic = "force-dynamic";

export default async function ClientContractSignPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const status = await getContractSignatureStatus({ token }).catch(() => null);
  if (!status) notFound();

  const portalAccess = await prisma.clientPortalToken.findUnique({
    where: { token },
    include: { account: { select: { name: true, email: true, phone: true } } },
  });
  if (!portalAccess) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Secure Client Portal</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Electronic Contract Signing</h2>
        <p className="mt-2 text-sm text-slate-600">
          This link is token-protected. If your access has expired or been revoked, signing will be blocked.
        </p>
      </section>

      <ContractPortalSignClient
        token={token}
        contractNumber={status.contractNumber}
        contractStatus={status.contractStatus}
        initialSignerName={portalAccess.account.name}
        initialSignerEmail={portalAccess.account.email}
        initialSignerPhone={portalAccess.account.phone ?? ""}
        canSign={status.canSign}
      />
    </main>
  );
}
