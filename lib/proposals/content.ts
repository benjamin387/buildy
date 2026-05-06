import { z } from "zod";

const proposalScopeItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  lineItemCount: z.number().int().nonnegative(),
  subtotal: z.number(),
});

const proposalBoqRowSchema = z.object({
  label: z.string(),
  detail: z.string().nullable(),
  amount: z.number(),
});

export const proposalContentSchema = z.object({
  designSummary: z.object({
    overview: z.string(),
    highlights: z.array(z.string()),
  }),
  scopeOfWork: z.object({
    summary: z.string(),
    sections: z.array(proposalScopeItemSchema),
  }),
  boqSummary: z.object({
    summary: z.string(),
    sourceLabel: z.string(),
    rows: z.array(proposalBoqRowSchema),
  }),
  pricingSummary: z.object({
    subtotal: z.number().nonnegative(),
    discountAmount: z.number().nonnegative(),
    gstAmount: z.number().nonnegative(),
    totalAmount: z.number().nonnegative(),
    validityDays: z.number().int().nonnegative().nullable(),
  }),
  terms: z.array(z.string()),
});

export type ProposalContent = z.infer<typeof proposalContentSchema>;

export function parseProposalContent(value: unknown): ProposalContent {
  return proposalContentSchema.parse(value);
}
