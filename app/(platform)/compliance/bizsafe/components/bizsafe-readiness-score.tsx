"use client";

import { BizsafeLevel } from "@prisma/client";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  getBizsafeReadinessScore,
  getMissingBizsafeRequirements,
  getRecommendedNextAction,
} from "@/lib/bizsafe/status";
import type {
  BizsafeDocumentDto,
  BizsafeProfileDto,
  BizsafeTaskDto,
  BizsafeTrainingRecordDto,
} from "@/app/(platform)/compliance/bizsafe/components/types";

function scoreTone(score: number): "success" | "info" | "warning" | "danger" {
  if (score >= 85) return "success";
  if (score >= 70) return "info";
  if (score >= 45) return "warning";
  return "danger";
}

export function BizsafeReadinessScore(props: {
  profile: BizsafeProfileDto;
  documents: BizsafeDocumentDto[];
  tasks: BizsafeTaskDto[];
  trainingRecords: BizsafeTrainingRecordDto[];
}) {
  const readinessScore = getBizsafeReadinessScore(
    props.profile,
    props.documents,
    props.tasks,
    props.trainingRecords,
  );
  const missingRequirements = getMissingBizsafeRequirements(
    props.profile,
    props.documents,
    props.trainingRecords,
  );
  const nextAction = getRecommendedNextAction(props.profile);
  const belowTenderLevel =
    props.profile.currentLevel === BizsafeLevel.NONE ||
    props.profile.currentLevel === BizsafeLevel.LEVEL_1 ||
    props.profile.currentLevel === BizsafeLevel.LEVEL_2;

  return (
    <SectionCard title="Project Tender Readiness" description="Tender-facing readiness, missing requirements, and next recommended action.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={scoreTone(readinessScore)}>{readinessScore}% Ready</StatusPill>
          <p className="text-sm text-neutral-600">
            Recommended next action: <span className="font-semibold text-neutral-950">{nextAction}</span>
          </p>
        </div>

        {belowTenderLevel ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-950">
            BizSAFE Level 3 is commonly required for construction and government-related tenders. Upgrade recommended before tender submission.
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-neutral-950">Readiness Score</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">{readinessScore}%</p>
            <p className="mt-2 text-sm text-neutral-600">
              Score is reduced by missing certificate, RM audit gaps, missing appointed personnel, expiring validity, and incomplete actions.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-neutral-950">Current blockers</p>
            {missingRequirements.length === 0 ? (
              <p className="mt-2 text-sm text-emerald-700">No major readiness blockers detected.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                {missingRequirements.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

