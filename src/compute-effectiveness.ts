/**
 * Computes effectiveness metrics based on the agent's decision journey
 * and the final PR outcome.
 *
 * Decision journey matrix:
 * | Initial | Final | Outcome | Category |
 * |---------|-------|---------|----------|
 * | APPROVE | APPROVE | MERGED | effective |
 * | APPROVE | APPROVE | CLOSED | neutral |
 * | REQUEST_CHANGES | APPROVE | MERGED | effective (feedback incorporated) |
 * | REQUEST_CHANGES | APPROVE | CLOSED | neutral |
 * | REQUEST_CHANGES | REQUEST_CHANGES | MERGED | overridden (agent ignored) |
 * | REQUEST_CHANGES | REQUEST_CHANGES | CLOSED | effective (blocked bad PR) |
 * | APPROVE | REQUEST_CHANGES | MERGED | overridden (late catch ignored) |
 * | APPROVE | REQUEST_CHANGES | CLOSED | effective (late catch succeeded) |
 */

type Decision = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
type FinalState = "MERGED" | "CLOSED";
type Category = "effective" | "overridden" | "neutral";

interface EffectivenessResult {
  initial_decision: string;
  final_decision: string;
  final_state: string;
  decision_changed: boolean;
  is_effective: number;
  is_overridden: number;
}

const CATEGORY_MAP: Record<string, Category> = {
  APPROVE_APPROVE_MERGED: "effective",
  APPROVE_APPROVE_CLOSED: "neutral",
  REQUEST_CHANGES_APPROVE_MERGED: "effective",
  REQUEST_CHANGES_APPROVE_CLOSED: "neutral",
  REQUEST_CHANGES_REQUEST_CHANGES_MERGED: "overridden",
  REQUEST_CHANGES_REQUEST_CHANGES_CLOSED: "effective",
  APPROVE_REQUEST_CHANGES_MERGED: "overridden",
  APPROVE_REQUEST_CHANGES_CLOSED: "effective",
};

function parseDecision(output: string | undefined): Decision | null {
  if (!output || output === "undefined") return null;
  try {
    if (output.startsWith("{")) {
      return JSON.parse(output).decision;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

function parseFinalState(output: string | undefined): FinalState | null {
  if (!output) return null;

  const trimmed = output.trim();

  // Handle direct state strings
  if (trimmed === "MERGED" || trimmed === "CLOSED") {
    return trimmed;
  }

  // Defensive: handle JSON output (shouldn't happen, but guard against it)
  try {
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      // If it's JSON with a state field, use that
      if (parsed.state === "MERGED" || parsed.state === "CLOSED") {
        return parsed.state;
      }
      // If it's the normal polling output, PR is still open - this shouldn't happen
      console.error(
        "Warning: compute-effectiveness received JSON output, PR may still be open"
      );
      return null;
    }
  } catch {
    // Not valid JSON
  }

  return null;
}

function computeEffectiveness(): EffectivenessResult {
  const initialOutput = process.env.INITIAL_OUTPUT;
  const reReviewOutput = process.env.RE_REVIEW_OUTPUT;
  const finalStateOutput = process.env.FINAL_STATE;

  const initial = parseDecision(initialOutput);
  const final = parseDecision(reReviewOutput) ?? initial;
  const state = parseFinalState(finalStateOutput);

  if (!initial || !final || !state) {
    // Cannot compute - return neutral with zeros
    return {
      initial_decision: initial ?? "UNKNOWN",
      final_decision: final ?? "UNKNOWN",
      final_state: state ?? "UNKNOWN",
      decision_changed: false,
      is_effective: 0,
      is_overridden: 0,
    };
  }

  // COMMENT decisions are always neutral
  let category: Category = "neutral";
  if (initial !== "COMMENT" && final !== "COMMENT") {
    const key = `${initial}_${final}_${state}`;
    category = CATEGORY_MAP[key] ?? "neutral";
  }

  return {
    initial_decision: initial,
    final_decision: final,
    final_state: state,
    decision_changed: initial !== final,
    is_effective: category === "effective" ? 1 : 0,
    is_overridden: category === "overridden" ? 1 : 0,
  };
}

// Main execution
const result = computeEffectiveness();
console.log(JSON.stringify(result));
