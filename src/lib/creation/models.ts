/**
 * DreamOS86 — Creation model registry.
 *
 * Top 8 flagship models + additional roster.
 * IDs must match what /api/chat understands (MODEL_CREDITS keys).
 * Ratings 1–5 reflect public benchmarks — never inflated.
 */

export type Rating1to5 = 1 | 2 | 3 | 4 | 5;

export type ModelSpecialization =
  | "architecture"
  | "frontend"
  | "backend"
  | "fullstack"
  | "analysis"
  | "speed"
  | "reasoning"
  | "multimodal";

export interface CreationModel {
  id: string;
  name: string;
  provider: "anthropic" | "openai" | "google" | "deepseek" | "xai" | "meta" | "cohere" | "mistral";
  tagline: string;
  flagship?: boolean;
  ratings: {
    intelligence: Rating1to5;
    reasoning: Rating1to5;
    frontend: Rating1to5;
    backend: Rating1to5;
    speed: Rating1to5;
    cost: Rating1to5; // 5 = cheapest, 1 = priciest
    orchestration: Rating1to5;
  };
  multimodal: boolean;
  contextK: number;
  credits: number;
  specialization: ModelSpecialization;
  orchestrationRole: string;
  idealFor: string[];
  weaknesses: string[];
  accent: string;
}

// ─── Top 8 flagship models ────────────────────────────────────────────────────

export const CREATION_MODELS: CreationModel[] = [
  // Anthropic — Opus 4.7 (top of class)
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "anthropic",
    tagline: "Maximum intelligence — frontier architecture & reasoning",
    flagship: true,
    ratings: { intelligence: 5, reasoning: 5, frontend: 5, backend: 5, speed: 2, cost: 1, orchestration: 5 },
    multimodal: true,
    contextK: 200,
    credits: 15,
    specialization: "architecture",
    orchestrationRole: "Lead architect — plans system structure, routes, and multi-agent strategy",
    idealFor: ["Full app architecture", "Complex multi-step systems", "Security-critical backend", "Production SaaS"],
    weaknesses: ["Slowest latency", "Highest credit cost — use intentionally"],
    accent: "#c08660",
  },
  // Anthropic — Opus 4.6
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    tagline: "Deep reasoning + code quality — the proven workhorse",
    flagship: true,
    ratings: { intelligence: 5, reasoning: 5, frontend: 5, backend: 5, speed: 2, cost: 2, orchestration: 5 },
    multimodal: true,
    contextK: 200,
    credits: 10,
    specialization: "fullstack",
    orchestrationRole: "Senior engineer — reliable for full-stack generation and critical refactors",
    idealFor: ["Full-stack app generation", "Complex refactors", "API design", "Production deployments"],
    weaknesses: ["Slower than Sonnet", "High cost for routine tasks"],
    accent: "#c08660",
  },
  // Anthropic — Sonnet 4.6 (best balance)
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    tagline: "Best balance of intelligence, speed, and cost",
    flagship: true,
    ratings: { intelligence: 5, reasoning: 4, frontend: 5, backend: 4, speed: 4, cost: 3, orchestration: 5 },
    multimodal: true,
    contextK: 200,
    credits: 3,
    specialization: "fullstack",
    orchestrationRole: "Default workhorse — handles most generation tasks with excellence",
    idealFor: ["Standard app generation", "UI/UX components", "API routes", "Rapid iteration"],
    weaknesses: ["Weaker than Opus on novel architectural problems"],
    accent: "#c08660",
  },
  // OpenAI — GPT-5.5
  {
    id: "gpt-5-5",
    name: "GPT-5.5",
    provider: "openai",
    tagline: "OpenAI's most capable — deep reasoning + multimodal",
    flagship: true,
    ratings: { intelligence: 5, reasoning: 5, frontend: 4, backend: 5, speed: 2, cost: 1, orchestration: 5 },
    multimodal: true,
    contextK: 128,
    credits: 12,
    specialization: "reasoning",
    orchestrationRole: "Strategist — planning phases, research synthesis, and novel problem solving",
    idealFor: ["Architecture planning", "Research-driven features", "Math-heavy backends", "Complex reasoning chains"],
    weaknesses: ["Slow", "Expensive", "Smaller context than Claude/Gemini"],
    accent: "#10a37f",
  },
  // OpenAI — GPT-5.4
  {
    id: "gpt-5-4",
    name: "GPT-5.4",
    provider: "openai",
    tagline: "Vision-first — design to code, multimodal generation",
    flagship: true,
    ratings: { intelligence: 5, reasoning: 4, frontend: 5, backend: 4, speed: 3, cost: 2, orchestration: 4 },
    multimodal: true,
    contextK: 128,
    credits: 6,
    specialization: "multimodal",
    orchestrationRole: "Visual architect — converts designs, screenshots, and images into working UI",
    idealFor: ["Image-to-UI generation", "Design reference translation", "Figma-to-code", "Vision-driven edits"],
    weaknesses: ["Smaller context window", "Less precise on complex backend logic"],
    accent: "#10a37f",
  },
  // Google — Gemini 2.5 Pro
  {
    id: "gemini-2-5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    tagline: "1M context — ingests entire codebases at once",
    flagship: true,
    ratings: { intelligence: 5, reasoning: 5, frontend: 4, backend: 4, speed: 3, cost: 2, orchestration: 4 },
    multimodal: true,
    contextK: 1000,
    credits: 5,
    specialization: "analysis",
    orchestrationRole: "Context specialist — analyzes entire repos, long docs, and multi-file systems",
    idealFor: ["Whole-codebase analysis", "Large document ingestion", "Full repo refactors", "Deep context tasks"],
    weaknesses: ["Verbose output", "Slower for short simple tasks"],
    accent: "#4285f4",
  },
  // Google — Gemini 2.0 Flash
  {
    id: "gemini-2-0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    tagline: "Fastest multimodal — 1M context at near-zero cost",
    flagship: true,
    ratings: { intelligence: 3, reasoning: 3, frontend: 3, backend: 3, speed: 5, cost: 5, orchestration: 3 },
    multimodal: true,
    contextK: 1000,
    credits: 1,
    specialization: "speed",
    orchestrationRole: "Fast multimodal executor — cheap long-context tasks with vision support",
    idealFor: ["Quick multimodal analysis", "Long-context summarization", "Cheap iteration", "Vision + speed"],
    weaknesses: ["Lower reasoning ceiling", "Not for novel architecture"],
    accent: "#4285f4",
  },
  // DeepSeek — V3
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    provider: "deepseek",
    tagline: "Frontier reasoning at near-zero cost",
    flagship: true,
    ratings: { intelligence: 4, reasoning: 5, frontend: 4, backend: 5, speed: 3, cost: 5, orchestration: 4 },
    multimodal: false,
    contextK: 64,
    credits: 1,
    specialization: "backend",
    orchestrationRole: "Backend specialist — API design, data modeling, server-side logic",
    idealFor: ["Backend architecture", "API design", "Database schema", "Cost-sensitive deep reasoning"],
    weaknesses: ["No vision", "Smaller context than Claude/Gemini"],
    accent: "#7c3aed",
  },

  // ─── Additional models ──────────────────────────────────────────────────────

  // Anthropic — Haiku (fast lane)
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    tagline: "Fastest Anthropic model — rapid iteration",
    ratings: { intelligence: 3, reasoning: 3, frontend: 3, backend: 3, speed: 5, cost: 5, orchestration: 3 },
    multimodal: false,
    contextK: 200,
    credits: 1,
    specialization: "speed",
    orchestrationRole: "Rapid executor — quick edits, discussion turns, high-frequency tasks",
    idealFor: ["Quick component edits", "Live discussion", "Bug triage", "Cheap iteration"],
    weaknesses: ["Weaker on novel architecture", "Less reliable for large refactors"],
    accent: "#c08660",
  },
  // OpenAI — GPT-4o
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    tagline: "Strong all-rounder with excellent vision",
    ratings: { intelligence: 4, reasoning: 4, frontend: 4, backend: 4, speed: 4, cost: 3, orchestration: 4 },
    multimodal: true,
    contextK: 128,
    credits: 4,
    specialization: "multimodal",
    orchestrationRole: "Visual intelligence — converts designs and screenshots into working UI",
    idealFor: ["Image-to-UI generation", "Mixed reasoning + speed", "Design translation"],
    weaknesses: ["Smaller context", "Occasional reasoning inconsistencies"],
    accent: "#10a37f",
  },
  // OpenAI — GPT-4o mini
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    tagline: "Fastest OpenAI model — high-volume subtasks",
    ratings: { intelligence: 3, reasoning: 3, frontend: 3, backend: 3, speed: 5, cost: 5, orchestration: 2 },
    multimodal: true,
    contextK: 128,
    credits: 1,
    specialization: "speed",
    orchestrationRole: "Bulk processor — high-frequency, low-complexity orchestration subtasks",
    idealFor: ["Bulk discussion", "Rapid iteration", "Cheap lookups"],
    weaknesses: ["Limited deep reasoning", "Not for full system architecture"],
    accent: "#10a37f",
  },
  // Google — Gemini Flash 1.5
  {
    id: "gemini-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    tagline: "Ultra fast, very low cost, 1M context",
    ratings: { intelligence: 3, reasoning: 2, frontend: 2, backend: 3, speed: 5, cost: 5, orchestration: 2 },
    multimodal: false,
    contextK: 1000,
    credits: 1,
    specialization: "speed",
    orchestrationRole: "Rapid responder — quick subtask resolution and summaries",
    idealFor: ["Rapid iteration", "Summaries", "Lightweight tasks"],
    weaknesses: ["Less accurate on complex tasks"],
    accent: "#4285f4",
  },
  // DeepSeek — Reasoner
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    provider: "deepseek",
    tagline: "Chain-of-thought reasoning at OpenAI o1 quality",
    ratings: { intelligence: 5, reasoning: 5, frontend: 3, backend: 5, speed: 2, cost: 4, orchestration: 4 },
    multimodal: false,
    contextK: 64,
    credits: 3,
    specialization: "reasoning",
    orchestrationRole: "Reasoning chain — deep problem solving, algorithmic design, and validation",
    idealFor: ["Hard algorithmic problems", "Deep logic", "Math-heavy features", "Security analysis"],
    weaknesses: ["Slow due to chain-of-thought", "Weaker on pure UI tasks"],
    accent: "#7c3aed",
  },

  // xAI — Grok 4
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "xai",
    tagline: "Real-time web access + strong coding & reasoning",
    ratings: { intelligence: 5, reasoning: 5, frontend: 4, backend: 5, speed: 3, cost: 2, orchestration: 4 },
    multimodal: true,
    contextK: 256,
    credits: 8,
    specialization: "reasoning",
    orchestrationRole: "Research-grounded engineer — brings live data into generation for modern, accurate output",
    idealFor: ["Current tech stack decisions", "API integration accuracy", "Research-heavy features", "News/data apps"],
    weaknesses: ["Higher cost", "Less fine-grained UI specialization"],
    accent: "#e7263e",
  },

  // Meta — Llama 4 Maverick
  {
    id: "llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "meta",
    tagline: "Open frontier model — vision + fast long-context",
    ratings: { intelligence: 4, reasoning: 4, frontend: 4, backend: 4, speed: 4, cost: 5, orchestration: 3 },
    multimodal: true,
    contextK: 128,
    credits: 2,
    specialization: "fullstack",
    orchestrationRole: "Open-weight executor — cost-efficient full-stack generation with vision support",
    idealFor: ["Balanced app generation", "Budget-conscious iteration", "Vision tasks", "Open deployment"],
    weaknesses: ["Less precise than Anthropic on critical architecture"],
    accent: "#0467df",
  },

  // Cohere — Command R+
  {
    id: "command-r-plus",
    name: "Command R+",
    provider: "cohere",
    tagline: "RAG-optimized reasoning with citation grounding",
    ratings: { intelligence: 4, reasoning: 4, frontend: 3, backend: 4, speed: 4, cost: 4, orchestration: 4 },
    multimodal: false,
    contextK: 128,
    credits: 3,
    specialization: "analysis",
    orchestrationRole: "Retrieval specialist — best for knowledge-intensive apps, documentation, and structured data",
    idealFor: ["Document-heavy apps", "Knowledge bases", "RAG pipelines", "Structured data extraction"],
    weaknesses: ["Weaker on pure UI generation", "No vision"],
    accent: "#d946ef",
  },

  // Mistral — Large
  {
    id: "mistral-large",
    name: "Mistral Large",
    provider: "mistral",
    tagline: "European frontier model — fast, capable, cost-effective",
    ratings: { intelligence: 4, reasoning: 4, frontend: 4, backend: 4, speed: 4, cost: 4, orchestration: 3 },
    multimodal: false,
    contextK: 128,
    credits: 2,
    specialization: "fullstack",
    orchestrationRole: "Efficient generalist — strong coding and reasoning at significantly lower cost",
    idealFor: ["Full-stack generation", "Multilingual apps", "Budget-sensitive production", "European compliance"],
    weaknesses: ["No vision", "Less strong on novel multi-agent orchestration"],
    accent: "#ff7000",
  },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export function getModel(id: string): CreationModel {
  return CREATION_MODELS.find((m) => m.id === id) ?? CREATION_MODELS[0];
}

export const FLAGSHIP_MODELS = CREATION_MODELS.filter((m) => m.flagship);
export const ADDITIONAL_MODELS = CREATION_MODELS.filter((m) => !m.flagship);

/** Three creation modes */
export type CreationMode = "discuss" | "edit" | "build";

export const MODE_META: Record<
  CreationMode,
  { label: string; description: string; hint: string; icon: string }
> = {
  discuss: {
    label: "Discuss",
    description:
      "Architecture, planning, debugging, research. Pick your model, have a real conversation.",
    hint: "Describe what you're thinking. Plan, explore, or diagnose.",
    icon: "MessageCircle",
  },
  edit: {
    label: "Edit",
    description:
      "Scope a prompt to a specific section, component, page, or layer. Precise, surgical edits.",
    hint: "Choose a scope, then describe the change.",
    icon: "Pencil",
  },
  build: {
    label: "Build",
    description:
      "Generate entire systems. Routes, backend, schemas, UI, animations, and runtime flows — all at once.",
    hint: "Describe the app you want. DreamOS86 builds the entire thing.",
    icon: "Zap",
  },
};
