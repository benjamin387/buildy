"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/app/(platform)/design-ai/floor-plans/_components/link-button";

const PIPELINE_STEPS = [
  "Analyze floor plan",
  "Generate furniture layout",
  "Generate 3D perspectives",
  "Generate cabinet design",
  "Generate production list",
  "Generate renovation workflow",
  "Generate BOQ",
  "Prepare quotation data",
  "Prepare proposal content",
] as const;

type StepStatus = "pending" | "loading" | "done";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function wait(durationMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

export function FullDesignPipeline(props: {
  completionHref: string;
  conceptHref: string;
  quotationHref: string;
  proposalHref: string;
  initialCompleted: boolean;
  persistsOutputs: boolean;
}) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(
    props.initialCompleted ? PIPELINE_STEPS.length - 1 : -1,
  );
  const [completedSteps, setCompletedSteps] = useState(
    props.initialCompleted ? PIPELINE_STEPS.length : 0,
  );

  const isComplete = !isRunning && completedSteps === PIPELINE_STEPS.length;
  const progress = useMemo(
    () => Math.round((completedSteps / PIPELINE_STEPS.length) * 100),
    [completedSteps],
  );

  async function handleGenerateFullDesign() {
    if (isRunning || isNavigating) return;

    setIsRunning(true);
    setCompletedSteps(0);
    setActiveStepIndex(0);

    for (const [index] of PIPELINE_STEPS.entries()) {
      setActiveStepIndex(index);
      await wait(180);
      setCompletedSteps(index + 1);
    }

    setIsRunning(false);
    setActiveStepIndex(PIPELINE_STEPS.length - 1);

    if (!props.initialCompleted) {
      startTransition(() => {
        router.replace(props.completionHref, { scroll: false });
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm leading-6 text-neutral-700">
            Run the full mock pipeline from plan interpretation through pricing and proposal prep in
            one pass. {props.persistsOutputs
              ? "The generated outputs are written back to the floor plan module after each saved step."
              : "The generated outputs stay inside the floor plan module for safe UI validation."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerateFullDesign}
            disabled={isRunning || isNavigating}
            className={cx(
              "inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
              isRunning || isNavigating
                ? "cursor-not-allowed bg-neutral-300 text-neutral-700"
                : "bg-neutral-950 text-white shadow-sm hover:bg-neutral-900",
            )}
          >
            {isRunning || isNavigating
              ? "Generating Full Design..."
              : isComplete
                ? "Regenerate Full Design"
                : "Generate Full Design"}
          </button>
          {isComplete ? (
            <>
              <LinkButton href={props.conceptHref} variant="secondary">
                Review Concept Package
              </LinkButton>
              <LinkButton href={props.quotationHref} variant="secondary">
                Review Pricing Summary
              </LinkButton>
              <LinkButton href={props.proposalHref} variant="secondary">
                Review Proposal Content
              </LinkButton>
            </>
          ) : null}
        </div>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Pipeline Progress
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {progress}%
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              {isComplete
                ? "All pipeline steps completed."
                : isRunning
                  ? `Running step ${activeStepIndex + 1} of ${PIPELINE_STEPS.length}.`
                  : "Ready to generate the complete design package."}
            </p>
          </div>

          <div className="min-w-[200px] text-sm text-neutral-600">
            <p>{completedSteps} of 9 steps complete</p>
          </div>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-neutral-950 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {PIPELINE_STEPS.map((step, index) => {
            const stepStatus: StepStatus =
              index < completedSteps
                ? "done"
                : isRunning && index === activeStepIndex
                  ? "loading"
                  : "pending";

            return (
              <article
                key={step}
                className={cx(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3",
                  stepStatus === "done" && "border-emerald-200 bg-emerald-50",
                  stepStatus === "loading" && "border-amber-200 bg-amber-50",
                  stepStatus === "pending" && "border-slate-200 bg-white",
                )}
              >
                <span
                  className={cx(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold uppercase tracking-[0.16em]",
                    stepStatus === "done" && "border-emerald-300 bg-white text-emerald-700",
                    stepStatus === "loading" && "border-amber-300 bg-white text-amber-700",
                    stepStatus === "pending" && "border-slate-200 bg-slate-50 text-neutral-600",
                  )}
                >
                  {stepStatus === "done" ? "OK" : stepStatus === "loading" ? "..." : index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-950">{step}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    {stepStatus === "done"
                      ? "Done"
                      : stepStatus === "loading"
                        ? "Loading"
                        : "Pending"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </article>
    </div>
  );
}
