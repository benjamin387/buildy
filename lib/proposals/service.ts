import "server-only";

import crypto from "node:crypto";
import { Prisma, ProposalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proposalContentSchema, type ProposalContent } from "@/lib/proposals/content";

function getPublicBaseUrl(): string {
  const value = process.env.PUBLIC_APP_URL?.trim();
  if (value) return value.replaceAll(/\/+$/g, "");
  return "http://localhost:3000";
}

export function buildPublicProposalPath(token: string): string {
  return `/share/proposal/${token}`;
}

export function buildPublicProposalUrl(token: string): string {
  return `${getPublicBaseUrl()}${buildPublicProposalPath(token)}`;
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function generateUniqueProposalToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateToken();
    const existing = await prisma.proposal.findUnique({
      where: { publicToken: token },
      select: { id: true },
    });
    if (!existing) return token;
  }

  throw new Error("Unable to generate a unique proposal token.");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function splitIntoPoints(...values: Array<string | null | undefined>): string[] {
  return values
    .flatMap((value) => (value ?? "").split(/\r?\n+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
  }

  return items;
}

function summarizeScope(sections: Array<{ lineItems: Array<unknown> }>): string {
  const itemCount = sections.reduce((sum, section) => sum + section.lineItems.length, 0);
  const sectionCount = sections.length;
  return `${sectionCount} work sections covering ${itemCount} quoted line items.`;
}

function buildTerms(params: {
  quotation: {
    issueDate: Date;
    validityDays: number | null;
    paymentTerms: string | null;
    exclusions: string | null;
    notes: string | null;
    paymentTermsV2: Array<{
      title: string;
      percent: Prisma.Decimal | null;
      amount: Prisma.Decimal | null;
      dueDate: Date | null;
      dueDays: number | null;
      notes: string | null;
    }>;
  };
}): string[] {
  const terms: string[] = [];

  if (params.quotation.validityDays) {
    terms.push(`Quotation valid for ${params.quotation.validityDays} days from ${formatDate(params.quotation.issueDate)}.`);
  }

  if (params.quotation.paymentTermsV2.length > 0) {
    for (const term of params.quotation.paymentTermsV2) {
      const pricing =
        term.percent !== null
          ? `${Number(term.percent).toFixed(0)}%`
          : term.amount !== null
            ? formatCurrency(Number(term.amount))
            : "Amount to be confirmed";
      const timing =
        term.dueDate
          ? `due ${formatDate(term.dueDate)}`
          : term.dueDays !== null
            ? `due in ${term.dueDays} day${term.dueDays === 1 ? "" : "s"}`
            : null;
      const note = cleanText(term.notes);

      terms.push(
        [term.title, pricing, timing, note].filter(Boolean).join(" · "),
      );
    }
  } else {
    terms.push(...splitIntoPoints(params.quotation.paymentTerms));
  }

  const exclusions = splitIntoPoints(params.quotation.exclusions).map((value) => `Exclusion: ${value}`);
  const notes = splitIntoPoints(params.quotation.notes);

  terms.push(...exclusions, ...notes);

  return uniqueStrings(terms).slice(0, 8);
}

function buildBoqSummary(params: {
  quotation: {
    sections: Array<{
      title: string;
      subtotal: Prisma.Decimal;
      lineItems: Array<unknown>;
    }>;
  };
  latestBoq:
    | {
        title: string;
        items: Array<{
          room: string;
          totalSellingPrice: Prisma.Decimal;
        }>;
      }
    | null
    | undefined;
}): ProposalContent["boqSummary"] {
  const latestBoq = params.latestBoq;

  if (latestBoq && latestBoq.items.length > 0) {
    const totalsByRoom = new Map<string, number>();

    for (const item of latestBoq.items) {
      const key = cleanText(item.room) ?? "General";
      totalsByRoom.set(key, (totalsByRoom.get(key) ?? 0) + Number(item.totalSellingPrice));
    }

    const rows = [...totalsByRoom.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, amount]) => ({
        label,
        detail: `${latestBoq.title} room budget`,
        amount,
      }));

    return {
      summary: "Commercial summary derived from the latest Design BOQ linked to this quotation.",
      sourceLabel: "Latest Design BOQ",
      rows,
    };
  }

  return {
    summary: "No linked Design BOQ was found, so the BOQ summary is based on the quotation work sections.",
    sourceLabel: "Quotation Scope",
    rows: params.quotation.sections.map((section) => ({
      label: section.title,
      detail: `${section.lineItems.length} line item${section.lineItems.length === 1 ? "" : "s"}`,
      amount: Number(section.subtotal),
    })),
  };
}

function buildDesignSummary(params: {
  projectName: string;
  brief:
    | {
        clientNeeds: string;
        aiSummary: string | null;
        preferredStyle: string | null;
        timeline: string | null;
      }
    | null
    | undefined;
  concept:
    | {
        conceptSummary: string;
        theme: string | null;
        materialPalette: string | null;
        lightingPlan: string | null;
        furnitureDirection: string | null;
        renovationScope: string | null;
      }
    | null
    | undefined;
}): ProposalContent["designSummary"] {
  const overview =
    cleanText(params.concept?.conceptSummary) ??
    cleanText(params.brief?.aiSummary) ??
    cleanText(params.brief?.clientNeeds) ??
    `This proposal outlines the recommended design-and-build direction for ${params.projectName}.`;

  const highlights = uniqueStrings([
    params.concept?.theme ? `Theme: ${params.concept.theme}` : null,
    params.concept?.materialPalette ? `Material palette: ${params.concept.materialPalette}` : null,
    params.concept?.lightingPlan ? `Lighting plan: ${params.concept.lightingPlan}` : null,
    params.concept?.furnitureDirection ? `Furniture direction: ${params.concept.furnitureDirection}` : null,
    params.concept?.renovationScope ? `Renovation scope: ${params.concept.renovationScope}` : null,
    params.brief?.preferredStyle ? `Preferred style: ${params.brief.preferredStyle}` : null,
    params.brief?.timeline ? `Timeline goal: ${params.brief.timeline}` : null,
  ]).slice(0, 6);

  return { overview, highlights };
}

export async function createOrUpdateProposalFromQuotation(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      proposal: {
        select: {
          id: true,
          publicToken: true,
          status: true,
        },
      },
      paymentTermsV2: { orderBy: { sortOrder: "asc" } },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      designBrief: {
        include: {
          concepts: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          boqs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              items: {
                orderBy: [{ room: "asc" }, { sortOrder: "asc" }],
                take: 500,
              },
            },
          },
        },
      },
    },
  });

  if (!quotation) throw new Error("Quotation not found.");

  const latestConcept = quotation.designBrief?.concepts[0] ?? null;
  const latestBoq = quotation.designBrief?.boqs[0] ?? null;
  const title = `${quotation.projectNameSnapshot} Proposal`;
  const clientName =
    cleanText(quotation.contactPersonSnapshot) ??
    cleanText(quotation.clientNameSnapshot) ??
    "Client";

  const content = proposalContentSchema.parse({
    designSummary: buildDesignSummary({
      projectName: quotation.projectNameSnapshot,
      brief: quotation.designBrief,
      concept: latestConcept,
    }),
    scopeOfWork: {
      summary: summarizeScope(quotation.sections),
      sections: quotation.sections.map((section) => ({
        title: section.title,
        description: cleanText(section.description),
        lineItemCount: section.lineItems.length,
        subtotal: Number(section.subtotal),
      })),
    },
    boqSummary: buildBoqSummary({
      quotation,
      latestBoq,
    }),
    pricingSummary: {
      subtotal: Number(quotation.subtotal),
      discountAmount: Number(quotation.discountAmount),
      gstAmount: Number(quotation.gstAmount),
      totalAmount: Number(quotation.totalAmount),
      validityDays: quotation.validityDays ?? null,
    },
    terms: buildTerms({ quotation }),
  });

  const publicToken = quotation.proposal?.publicToken ?? (await generateUniqueProposalToken());
  const nextStatus =
    quotation.proposal?.status === ProposalStatus.APPROVED ? ProposalStatus.APPROVED : ProposalStatus.SENT;

  if (quotation.proposal) {
    return prisma.proposal.update({
      where: { id: quotation.proposal.id },
      data: {
        title,
        clientName,
        content: content as Prisma.InputJsonValue,
        status: nextStatus,
        viewedAt: nextStatus === ProposalStatus.SENT ? null : undefined,
      },
      include: {
        quotation: {
          select: {
            id: true,
            projectId: true,
            quotationNumber: true,
            projectNameSnapshot: true,
          },
        },
      },
    });
  }

  return prisma.proposal.create({
    data: {
      quotationId,
      title,
      clientName,
      content: content as Prisma.InputJsonValue,
      publicToken,
      status: ProposalStatus.SENT,
    },
    include: {
      quotation: {
        select: {
          id: true,
          projectId: true,
          quotationNumber: true,
          projectNameSnapshot: true,
        },
      },
    },
  });
}
