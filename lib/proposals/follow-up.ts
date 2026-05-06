import "server-only";

import { ProposalActivityType, ProposalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createProposalActivity,
  getProposalWhatsAppContext,
  sendProposalWhatsAppMessage,
} from "@/lib/proposals/activity";

const DAY_MS = 24 * 60 * 60 * 1000;

function getLatestActivity(
  activities: Array<{ type: ProposalActivityType; createdAt: Date }>,
  type: ProposalActivityType,
) {
  return activities.find((activity) => activity.type === type) ?? null;
}

function hasReminderAfter(
  activities: Array<{ type: ProposalActivityType; createdAt: Date }>,
  since: Date,
) {
  return activities.some(
    (activity) =>
      activity.type === ProposalActivityType.REMINDER &&
      activity.createdAt.getTime() > since.getTime(),
  );
}

export async function runProposalFollowupCron() {
  const now = new Date();
  const proposals = await prisma.proposal.findMany({
    where: {
      status: {
        in: [ProposalStatus.SENT, ProposalStatus.VIEWED],
      },
    },
    select: {
      id: true,
      status: true,
      activities: {
        select: {
          type: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  let initialRemindersSent = 0;
  let viewedFollowUpsSent = 0;
  let skipped = 0;

  const errors: Array<{ proposalId: string; error: string }> = [];

  for (const proposal of proposals) {
    const latestSent = getLatestActivity(proposal.activities, ProposalActivityType.SENT);
    const latestViewed = getLatestActivity(proposal.activities, ProposalActivityType.VIEWED);
    const latestApproved = getLatestActivity(proposal.activities, ProposalActivityType.APPROVED);

    if (!latestSent) {
      skipped += 1;
      continue;
    }

    const needsInitialReminder =
      (!latestViewed ||
        latestViewed.createdAt.getTime() < latestSent.createdAt.getTime()) &&
      now.getTime() - latestSent.createdAt.getTime() >= DAY_MS &&
      !hasReminderAfter(proposal.activities, latestSent.createdAt);

    const needsViewedFollowUp =
      !needsInitialReminder &&
      latestViewed &&
      (!latestApproved ||
        latestApproved.createdAt.getTime() < latestViewed.createdAt.getTime()) &&
      now.getTime() - latestViewed.createdAt.getTime() >= 2 * DAY_MS &&
      !hasReminderAfter(proposal.activities, latestViewed.createdAt);

    if (!needsInitialReminder && !needsViewedFollowUp) {
      skipped += 1;
      continue;
    }

    try {
      const context = await getProposalWhatsAppContext(proposal.id);
      if (!context.phone) {
        skipped += 1;
        continue;
      }

      await sendProposalWhatsAppMessage({
        context,
        kind: needsInitialReminder ? "UNVIEWED_REMINDER" : "VIEWED_FOLLOW_UP",
      });

      await createProposalActivity(prisma, {
        proposalId: proposal.id,
        type: ProposalActivityType.REMINDER,
      });

      if (needsInitialReminder) {
        initialRemindersSent += 1;
      } else {
        viewedFollowUpsSent += 1;
      }
    } catch (error) {
      errors.push({
        proposalId: proposal.id,
        error: error instanceof Error ? error.message : "Unexpected proposal follow-up failure.",
      });
    }
  }

  return {
    ok: errors.length === 0,
    processed: proposals.length,
    initialRemindersSent,
    viewedFollowUpsSent,
    skipped,
    errors,
  };
}
