import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SignaturePartyStatus, SignatureRequestStatus } from "@prisma/client";

const actionSchema = z.object({
  action: z.enum(["viewed", "signed", "rejected"]),
  signedName: z.string().optional(),
});

function nowPlusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function requestStatusFromParties(parties: { status: SignaturePartyStatus }[]): SignatureRequestStatus {
  if (parties.some((p) => p.status === "REJECTED")) return "REJECTED";
  const signedCount = parties.filter((p) => p.status === "SIGNED").length;
  if (signedCount === parties.length && parties.length > 0) return "SIGNED";
  if (signedCount > 0) return "PARTIALLY_SIGNED";
  if (parties.some((p) => p.status === "VIEWED")) return "VIEWED";
  return "SENT";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string; partyId: string }> },
) {
  try {
    const { requestId, partyId } = await context.params;
    const body = await request.json();
    const input = actionSchema.parse(body);

    const signatureRequest = await prisma.signatureRequest.findUnique({
      where: { id: requestId },
      include: { parties: true, contract: true },
    });
    if (!signatureRequest) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const party = signatureRequest.parties.find((p) => p.id === partyId);
    if (!party) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const now = new Date();
    const expiresAt = signatureRequest.expiresAt ?? nowPlusDays(14);
    const isExpired = now.getTime() > expiresAt.getTime();

    if (isExpired && signatureRequest.status !== "SIGNED") {
      await prisma.$transaction(async (tx) => {
        await tx.signatureRequest.update({
          where: { id: requestId },
          data: { status: "EXPIRED", expiresAt },
        });
        if (signatureRequest.contractId && signatureRequest.contract) {
          await tx.contract.update({
            where: { id: signatureRequest.contractId },
            data: { status: "EXPIRED" },
          });
          await tx.project.update({
            where: { id: signatureRequest.contract.projectId },
            data: { contractStatus: "EXPIRED" },
          });
        }
      });
      return NextResponse.json({ success: false, error: "Expired" }, { status: 410 });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    const userAgent = request.headers.get("user-agent") ?? null;

    const result = await prisma.$transaction(async (tx) => {
      if (input.action === "viewed") {
        if (party.status === "PENDING") {
          await tx.signatureParty.update({
            where: { id: party.id },
            data: { status: "VIEWED" },
          });
        }

        await tx.signatureEvent.create({
          data: {
            signatureRequestId: requestId,
            eventType: "VIEWED",
            actorName: party.name,
            actorEmail: party.email,
            ipAddress,
            userAgent,
            eventAt: now,
          },
        });

        const updatedParties = await tx.signatureParty.findMany({
          where: { signatureRequestId: requestId },
          select: { status: true },
        });

        const nextStatus = requestStatusFromParties(updatedParties);
        await tx.signatureRequest.update({
          where: { id: requestId },
          data: {
            status: nextStatus,
            viewedAt: signatureRequest.viewedAt ?? now,
            expiresAt,
          },
        });

        return { requestStatus: nextStatus };
      }

      if (input.action === "rejected") {
        // Enforce signing order: only the next pending party can reject/sign,
        // to prevent later parties from acting before earlier parties.
        const remaining = signatureRequest.parties
          .filter((p) => p.status !== "SIGNED" && p.status !== "REJECTED" && p.status !== "EXPIRED")
          .sort((a, b) => a.sequenceNo - b.sequenceNo);
        const next = remaining[0] ?? null;
        if (!next || next.id !== party.id) {
          return { error: "Not your turn to act yet. Please wait for prior signers." };
        }

        await tx.signatureParty.update({
          where: { id: party.id },
          data: { status: "REJECTED" },
        });

        await tx.signatureEvent.create({
          data: {
            signatureRequestId: requestId,
            eventType: "REJECTED",
            actorName: party.name,
            actorEmail: party.email,
            ipAddress,
            userAgent,
            eventAt: now,
          },
        });

        await tx.signatureRequest.update({
          where: { id: requestId },
          data: { status: "REJECTED" },
        });

        if (signatureRequest.contractId) {
          await tx.contract.update({
            where: { id: signatureRequest.contractId },
            data: { status: "REJECTED" },
          });
          if (signatureRequest.contract) {
            await tx.project.update({
              where: { id: signatureRequest.contract.projectId },
              data: { contractStatus: "REJECTED" },
            });
          }
        }

        return { requestStatus: "REJECTED" as const };
      }

      // signed
      const remaining = signatureRequest.parties
        .filter((p) => p.status !== "SIGNED" && p.status !== "REJECTED" && p.status !== "EXPIRED")
        .sort((a, b) => a.sequenceNo - b.sequenceNo);
      const next = remaining[0] ?? null;
      if (!next || next.id !== party.id) {
        return { error: "Not your turn to sign yet. Please wait for prior signers." };
      }

      const signedName = input.signedName?.trim();
      if (!signedName) {
        return { error: "Signer name is required." };
      }

      await tx.signatureParty.update({
        where: { id: party.id },
        data: { status: "SIGNED", signedAt: now, name: signedName },
      });

      await tx.signatureEvent.create({
        data: {
          signatureRequestId: requestId,
          eventType: "SIGNED",
          actorName: signedName,
          actorEmail: party.email,
          ipAddress,
          userAgent,
          eventAt: now,
        },
      });

      const updatedParties = await tx.signatureParty.findMany({
        where: { signatureRequestId: requestId },
        select: { status: true },
      });

      const nextStatus = requestStatusFromParties(updatedParties);
      await tx.signatureRequest.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          viewedAt: signatureRequest.viewedAt ?? now,
          signedAt: nextStatus === "SIGNED" ? now : signatureRequest.signedAt,
          expiresAt,
        },
      });

      if (signatureRequest.contractId) {
        if (nextStatus === "SIGNED") {
          await tx.contract.update({
            where: { id: signatureRequest.contractId },
            data: { status: "SIGNED", lockedAt: now, signedAt: now },
          });
          if (signatureRequest.contract) {
            await tx.project.update({
              where: { id: signatureRequest.contract.projectId },
              data: { contractStatus: "SIGNED" },
            });
          }
        } else if (nextStatus === "PARTIALLY_SIGNED") {
          await tx.contract.update({
            where: { id: signatureRequest.contractId },
            data: { status: "PARTIALLY_SIGNED" },
          });
          if (signatureRequest.contract) {
            await tx.project.update({
              where: { id: signatureRequest.contract.projectId },
              data: { contractStatus: "PARTIALLY_SIGNED" },
            });
          }
        }
      }

      return { requestStatus: nextStatus };
    });

    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
