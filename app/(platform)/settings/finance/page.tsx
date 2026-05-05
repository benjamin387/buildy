import "server-only";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { requireExecutive } from "@/lib/rbac/executive";
import { getCompanySetting } from "@/lib/settings/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { updateFinanceSettingsAction } from "@/app/(platform)/settings/finance/actions";

export const dynamic = "force-dynamic";

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm",
        "placeholder:text-neutral-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-950 shadow-sm",
        "placeholder:text-neutral-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-neutral-900">{props.label}</p>
        {props.hint ? <p className="mt-1 text-xs leading-5 text-neutral-500">{props.hint}</p> : null}
      </div>
      {props.children}
    </div>
  );
}

export default async function FinanceSettingsPage() {
  await requireExecutive();
  const company = await getCompanySetting();

  const gstRatePercent = Number(company.gstRate) * 100;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Finance Defaults"
        subtitle="GST defaults and payment instructions used by quotations, contracts and invoices."
        backHref="/settings"
        backLabel="Settings"
      />

      <form action={updateFinanceSettingsAction} className="space-y-8">
        <SectionCard
          title="GST"
          description="Default tax settings. Invoices store tax amounts explicitly; these defaults guide document headers and future tax mappings."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-stone-50 px-4 py-3">
              <input
                type="checkbox"
                name="gstRegistered"
                defaultChecked={company.gstRegistered}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-semibold text-neutral-900">GST registered</p>
                <p className="text-xs text-neutral-600">Show GST details on client-facing documents.</p>
              </div>
            </label>

            <Field label="GST rate (%)" hint="Example: 9 for 9%. Stored internally as a decimal.">
              <Input
                name="gstRatePercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={Number.isFinite(gstRatePercent) ? gstRatePercent.toFixed(2) : "9.00"}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="Payment Terms & Instructions"
          description="Used in invoice print view and delivery templates. Keep instructions short and explicit for clients."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Default payment terms"
              hint="Short text shown on documents when no per-document terms are specified."
            >
              <Textarea
                name="defaultPaymentTerms"
                defaultValue={company.defaultPaymentTerms ?? ""}
                rows={4}
                placeholder="Payment due within 7 days from invoice date."
              />
            </Field>
            <Field
              label="Payment instructions"
              hint="Displayed on invoices; can include bank transfer and PayNow details."
            >
              <Textarea
                name="paymentInstructions"
                defaultValue={company.paymentInstructions ?? ""}
                rows={4}
                placeholder="Please transfer to our nominated account and include the invoice number as reference."
              />
            </Field>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Bank name">
              <Input name="bankName" defaultValue={company.bankName ?? ""} placeholder="DBS / OCBC / UOB" />
            </Field>
            <Field label="Bank account name">
              <Input name="bankAccountName" defaultValue={company.bankAccountName ?? ""} placeholder={company.companyName} />
            </Field>
            <Field label="Bank account number">
              <Input name="bankAccountNumber" defaultValue={company.bankAccountNumber ?? ""} placeholder="123-456-7890" />
            </Field>
            <Field label="PayNow UEN">
              <Input name="paynowUen" defaultValue={company.paynowUen ?? ""} placeholder="2019XXXXXXZ" />
            </Field>
          </div>
        </SectionCard>

        <div className="flex items-center justify-end">
          <ActionButton type="submit" variant="primary">
            Save Finance Defaults
          </ActionButton>
        </div>
      </form>
    </main>
  );
}
