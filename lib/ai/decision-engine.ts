import "server-only";

import { evaluateDecisionRules, type DecisionAction, type DecisionRulesInput } from "@/lib/ai/decision-rules";

/**
 * AI Decision Engine (deterministic, rule-based).
 *
 * This is intentionally NOT an executor. It produces recommended actions only.
 * Execution is handled by the AI Action Runner with approval gates.
 */
export function evaluateNextActions(input: DecisionRulesInput): DecisionAction[] {
  return evaluateDecisionRules(input);
}

