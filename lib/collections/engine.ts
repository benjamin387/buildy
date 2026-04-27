import { CollectionActionType, CollectionChannel, CollectionSeverity } from "@prisma/client";

export function computeDaysPastDue(dueDate: Date, now = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = now.getTime() - dueDate.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / msPerDay);
}

export function computeCollectionSeverity(daysPastDue: number): CollectionSeverity {
  if (daysPastDue > 30) return "CRITICAL";
  if (daysPastDue >= 15) return "HIGH";
  if (daysPastDue >= 8) return "MEDIUM";
  if (daysPastDue >= 1) return "LOW";
  return "LOW";
}

export type NextCollectionsActionPlan = {
  actionType: CollectionActionType;
  channel: CollectionChannel;
  templateCode: string | null;
  suggestedSubject: string | null;
};

export function computeNextCollectionsActionPlan(daysPastDue: number): NextCollectionsActionPlan | null {
  // Based on the requested milestones:
  // 7 days: WhatsApp/email reminder
  // 14 days: stronger reminder
  // 21 days: letter of demand
  // 30 days: legal escalation review
  if (daysPastDue >= 30) {
    return {
      actionType: "LEGAL_ESCALATION",
      channel: "MANUAL",
      templateCode: "COLL_MANUAL_30_LEGAL",
      suggestedSubject: "Legal escalation review",
    };
  }

  if (daysPastDue >= 21) {
    return {
      actionType: "LETTER_OF_DEMAND",
      channel: "EMAIL",
      templateCode: "COLL_EMAIL_21_LOD",
      suggestedSubject: "Letter of demand (payment overdue)",
    };
  }

  if (daysPastDue >= 14) {
    return {
      actionType: "EMAIL_REMINDER",
      channel: "EMAIL",
      templateCode: "COLL_EMAIL_14_STRONG",
      suggestedSubject: "Payment overdue reminder",
    };
  }

  if (daysPastDue >= 7) {
    return {
      actionType: "WHATSAPP_REMINDER",
      channel: "WHATSAPP",
      templateCode: "COLL_WA_7_REMINDER",
      suggestedSubject: null,
    };
  }

  return null;
}

