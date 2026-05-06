import "server-only";

import { ProposalActivityType, ProposalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createProposalActivity,
  getProposalWhatsAppContext,
  sendProposalWhatsAppMessage,
  type ProposalWhatsAppMessageKind,
} from "@/lib/proposals/activity";

const DAY_MS = 24 * 60 * 60 * 1000;

function getLatestActivity(
  activities: Array<{ type: ProposalActivityType; createdAt: Date }>,
  type: ProposalActivityType,
) {
  let latest: { type: ProposalActivityType; createdAt: Date } | null = null;

  for (const activity of activities) {
    if (activity.type !== type) continue;
    if (!latest || activity.createdAt.getTime() > latest.createdAt.getTime()) {
      latest = activity;
    }
  }

  return latest;
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

export function getProposalFollowUpState(params: {
  status: ProposalStatus;
  activities: Array<{ type: ProposalActivityType; createdAt: Date }>;
  now?: Date;
}): {
  due: boolean;
  kind: Exclude<ProposalWhatsAppMessageKind, "INITIAL"> | null;
  dueSince: Date | null;
} {
  if (params.status !== ProposalStatus.SENT && params.status !== ProposalStatus.VIEWED) {
    return {
      due: false,
      kind: null,
      dueSince: null,
    };
  }

  const now = params.now ?? new Date();
  const latestSent = getLatestActivity(params.activities, ProposalActivityType.SENT);
  const latestViewed = getLatestActivity(params.activities, ProposalActivityType.VIEWED);
  const latestApproved = getLatestActivity(params.activities, ProposalActivityType.APPROVED);

  if (!latestSent) {
    return {
      due: false,
      kind: null,
      dueSince: null,
    };
  }

  const needsInitialReminder =
    (!latestViewed ||
      latestViewed.createdAt.getTime() < latestSent.createdAt.getTime()) &&
    now.getTime() - latestSent.createdAt.getTime() >= DAY_MS &&
    !hasReminderAfter(params.activities, latestSent.createdAt);

  if (needsInitialReminder) {
    return {
      due: true,
      kind: "UNVIEWED_REMINDER",
      dueSince: latestSent.createdAt,
    };
  }

  const needsViewedFollowUp = latestViewed
    ? (!latestApproved ||
        latestApproved.createdAt.getTime() < latestViewed.createdAt.getTime()) &&
      now.getTime() - latestViewed.createdAt.getTime() >= 2 * DAY_MS &&
      !hasReminderAfter(params.activities, latestViewed.createdAt)
    : false;

  if (needsViewedFollowUp) {
    return {
      due: true,
      kind: "VIEWED_FOLLOW_UP",
      dueSince: latestViewed?.createdAt ?? null,
    };
  }

  return {
    due: false,
    kind: null,
    dueSince: null,
  };
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
    const followUp = getProposalFollowUpState({
      status: proposal.status,
      activities: proposal.activities,
      now,
    });

    if (!followUp.due || !followUp.kind) {
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
        kind: followUp.kind,
      });

      await createProposalActivity(prisma, {
        proposalId: proposal.id,
        type: ProposalActivityType.REMINDER,
      });

      if (followUp.kind === "UNVIEWED_REMINDER") {
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
