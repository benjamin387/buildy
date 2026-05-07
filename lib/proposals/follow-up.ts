import "server-only";

import { ProposalActivityType, ProposalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createProposalActivity,
  getProposalReminderActivityType,
  getProposalWhatsAppContext,
  sendProposalWhatsAppMessage,
  type ProposalReminderKind,
} from "@/lib/proposals/activity";

const DAY_MS = 24 * 60 * 60 * 1000;

type ProposalActivityRow = {
  type: ProposalActivityType;
  createdAt: Date;
};

function getLatestActivity(
  activities: ProposalActivityRow[],
  type: ProposalActivityType,
) {
  let latest: ProposalActivityRow | null = null;

  for (const activity of activities) {
    if (activity.type !== type) continue;
    if (!latest || activity.createdAt.getTime() > latest.createdAt.getTime()) {
      latest = activity;
    }
  }

  return latest;
}

function hasReminderAfter(
  activities: ProposalActivityRow[],
  since: Date,
  type: ProposalActivityType,
) {
  return activities.some(
    (activity) =>
      activity.type === type &&
      activity.createdAt.getTime() > since.getTime(),
  );
}

export function getManualProposalReminderKind(params: {
  status: ProposalStatus;
  activities: ProposalActivityRow[];
}): ProposalReminderKind | null {
  if (
    params.status === ProposalStatus.DRAFT ||
    params.status === ProposalStatus.APPROVED ||
    params.status === ProposalStatus.REJECTED
  ) {
    return null;
  }

  const latestViewed = getLatestActivity(params.activities, ProposalActivityType.VIEWED);
  const latestApproved = getLatestActivity(params.activities, ProposalActivityType.APPROVED);
  if (
    latestViewed &&
    (!latestApproved || latestApproved.createdAt.getTime() < latestViewed.createdAt.getTime())
  ) {
    return "REMINDER_2";
  }

  const latestSent = getLatestActivity(params.activities, ProposalActivityType.SENT);
  return latestSent ? "REMINDER_1" : null;
}

export function getProposalFollowUpState(params: {
  status: ProposalStatus;
  activities: ProposalActivityRow[];
  now?: Date;
}): {
  due: boolean;
  kind: ProposalReminderKind | null;
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

  const needsInitialReminder = latestSent
    ? (!latestViewed ||
        latestViewed.createdAt.getTime() < latestSent.createdAt.getTime()) &&
      now.getTime() - latestSent.createdAt.getTime() >= DAY_MS &&
      !hasReminderAfter(params.activities, latestSent.createdAt, ProposalActivityType.REMINDER_1)
    : false;

  if (needsInitialReminder) {
    return {
      due: true,
      kind: "REMINDER_1",
      dueSince: latestSent?.createdAt ?? null,
    };
  }

  const needsViewedFollowUp = latestViewed
    ? (!latestApproved ||
        latestApproved.createdAt.getTime() < latestViewed.createdAt.getTime()) &&
      now.getTime() - latestViewed.createdAt.getTime() >= 2 * DAY_MS &&
      !hasReminderAfter(params.activities, latestViewed.createdAt, ProposalActivityType.REMINDER_2)
    : false;

  if (needsViewedFollowUp) {
    return {
      due: true,
      kind: "REMINDER_2",
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
        type: getProposalReminderActivityType(followUp.kind),
      });

      if (followUp.kind === "REMINDER_1") {
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
