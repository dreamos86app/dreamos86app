export type BuildIntent =
  | "build_app"
  | "edit_app"
  | "discuss_question"
  | "clarification_needed";

export type BuildIntentResult = {
  intent: BuildIntent;
  confidence: number;
  reason: string;
};

const GREETING = /^(hi|hello|hey|yo|sup|test|thanks|thank you|ok|okay)[\s!.?]*$/i;
const QUESTION =
  /^(how much|what model|which model|how many credits|credits|pricing|help|explain|what is|who are|why|when)\b/i;
const META =
  /\b(credits?|pricing|plan|subscription|token|model am i|what model|how does dreamos)\b/i;
const BUILD_VERBS =
  /\b(build|create|make|generate|design|develop|scaffold|add|implement|ship|launch)\b/i;
const APP_NOUNS =
  /\b(app|application|website|site|dashboard|portal|platform|tool|saas|store|marketplace|calculator|tracker|crm|blog|chat)\b/i;
const EDIT_VERBS = /\b(edit|update|change|fix|modify|refactor|improve|tweak|adjust)\b/i;

export function classifyBuildIntent(prompt: string): BuildIntentResult {
  const text = prompt.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { intent: "clarification_needed", confidence: 0.95, reason: "empty_prompt" };
  }

  if (GREETING.test(text)) {
    return { intent: "discuss_question", confidence: 0.92, reason: "greeting_or_test" };
  }

  if (QUESTION.test(lower) || (META.test(lower) && !BUILD_VERBS.test(lower))) {
    return { intent: "discuss_question", confidence: 0.88, reason: "product_or_meta_question" };
  }

  if (text.length < 12 && !BUILD_VERBS.test(lower) && !APP_NOUNS.test(lower)) {
    return { intent: "clarification_needed", confidence: 0.75, reason: "too_short_for_build" };
  }

  if (EDIT_VERBS.test(lower) && (APP_NOUNS.test(lower) || /\b(this|my|the)\s+(app|project|screen|page)\b/i.test(lower))) {
    return { intent: "edit_app", confidence: 0.82, reason: "edit_request" };
  }

  if (BUILD_VERBS.test(lower) || APP_NOUNS.test(lower)) {
    const confidence = BUILD_VERBS.test(lower) && APP_NOUNS.test(lower) ? 0.9 : 0.72;
    return { intent: "build_app", confidence, reason: "app_creation_signals" };
  }

  if (text.split(/\s+/).length >= 8) {
    return { intent: "build_app", confidence: 0.55, reason: "detailed_prompt_default_build" };
  }

  return { intent: "discuss_question", confidence: 0.7, reason: "no_clear_app_request" };
}

/** True when build mode should create jobs / save generated app files. */
export function shouldStartBuildPipeline(
  mode: string,
  intent: BuildIntentResult | null,
): boolean {
  if (mode !== "build") return false;
  if (!intent) return true;
  return intent.intent === "build_app" || intent.intent === "edit_app";
}
