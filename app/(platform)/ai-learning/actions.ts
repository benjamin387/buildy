"use server";

import { revalidatePath } from "next/cache";
import { requireExecutive } from "@/lib/rbac/executive";
import { recalculateLearningMetrics, updateRecommendationScores } from "@/lib/ai/learning-layer";

export async function recalculateAILearningAction() {
  await requireExecutive();

  await recalculateLearningMetrics({ horizonDays: 180 });
  await updateRecommendationScores({ horizonDays: 180 });

  revalidatePath("/ai-learning");
  revalidatePath("/command-center");
}

