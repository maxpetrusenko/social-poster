import "server-only";

/**
 * Max Petrusenko context provider for X liked-post autoposts.
 * 
 * Provides facts about Max's work, expertise, and voice for the AI writer.
 * In production, this can be backed by a curated facts file, database, or gbrain.
 * Graceful fallback when external systems are unavailable.
 */

export type MaxContextFact = {
  category: "identity" | "expertise" | "work" | "voice_example";
  fact: string;
  confidence: "verified" | "inferred";
};

/**
 * Core facts about Max that can be used in first-person when relevant.
 * These are verified, public facts from the repo and user-provided context.
 */
const CORE_MAX_FACTS: MaxContextFact[] = [
  {
    category: "identity",
    fact: "Max Petrusenko (@petrusenko_max on X) is a senior AI systems engineer and forward deployed engineer",
    confidence: "verified",
  },
  {
    category: "work",
    fact: "Max previously worked at US Treasury",
    confidence: "verified",
  },
  {
    category: "work",
    fact: "Max built SMM Agent (smmagent.app), a social automation dashboard and agent",
    confidence: "verified",
  },
  {
    category: "work",
    fact: "Max runs Contabo VPS via Coolify for production infrastructure",
    confidence: "verified",
  },
  {
    category: "work",
    fact: "Max uses Doppler for secrets management",
    confidence: "verified",
  },
  {
    category: "work",
    fact: "Max uses LiteLLM-style model routing stacks",
    confidence: "verified",
  },
  {
    category: "expertise",
    fact: "Max builds agent fleets and autonomous systems",
    confidence: "verified",
  },
];

/**
 * Voice examples from Max's actual posts (lowercase, story-mode, specific objects).
 * Real posts provided by the user. Can be loaded configurably via external provider.
 */
const MAX_VOICE_EXAMPLES = [
  {
    category: "voice_example" as const,
    fact: "my server posts for me three times a day now. smm agent writes the draft, then a second agent reviews it before a single word goes out to x and linkedin. the writer is replaceable. the gate is the product",
    confidence: "verified" as const,
  },
  {
    category: "voice_example" as const,
    fact: "tonight i fired myself as the copy paste layer between my research agent and my own posting tool. it reads what's working on x, writes, and ships through smm agent on my server. laptop closed. we'll see if the numbers agree",
    confidence: "verified" as const,
  },
];

/**
 * Get Max context relevant to a source post.
 * Returns facts that might be relevant for first-person commentary.
 */
export function getMaxContextForSource(input: {
  sourceText: string;
  sourceUrl: string;
  authorHandle: string;
}): MaxContextFact[] {
  const sourceNormalized = input.sourceText.toLowerCase();
  const relevantFacts: MaxContextFact[] = [];

  // Agent/AI systems context
  if (/\b(agent|agents|autonomous|automation|fleet)\b/i.test(sourceNormalized)) {
    relevantFacts.push(
      ...CORE_MAX_FACTS.filter((f) => 
        f.category === "expertise" || 
        (f.category === "work" && f.fact.includes("agent"))
      )
    );
  }

  // Infrastructure/deployment context
  if (/\b(deploy|infrastructure|production|vps|docker|coolify)\b/i.test(sourceNormalized)) {
    relevantFacts.push(
      ...CORE_MAX_FACTS.filter((f) => 
        f.category === "work" && 
        (f.fact.includes("Contabo") || f.fact.includes("Coolify") || f.fact.includes("Doppler"))
      )
    );
  }

  // Model/LLM context
  if (/\b(model|llm|openai|anthropic|gpt|claude|routing)\b/i.test(sourceNormalized)) {
    relevantFacts.push(
      ...CORE_MAX_FACTS.filter((f) => 
        f.fact.includes("LiteLLM") || f.fact.includes("model routing")
      )
    );
  }

  // Always include identity for context
  if (relevantFacts.length > 0) {
    const identityFact = CORE_MAX_FACTS.find((f) => f.category === "identity");
    if (identityFact && !relevantFacts.includes(identityFact)) {
      relevantFacts.unshift(identityFact);
    }
  }

  return relevantFacts;
}

/**
 * Get voice examples to demonstrate Max's style (not as rules).
 */
export function getMaxVoiceExamples(): MaxContextFact[] {
  return MAX_VOICE_EXAMPLES;
}

/**
 * Format Max context for inclusion in the writer prompt.
 */
export function formatMaxContextForPrompt(facts: MaxContextFact[]): string {
  if (facts.length === 0) {
    return "No specific Max context available for this source.";
  }

  const sections: string[] = [];
  
  const verifiedFacts = facts.filter((f) => f.category !== "voice_example");
  if (verifiedFacts.length > 0) {
    sections.push(
      "Max context (use for first-person commentary ONLY when directly relevant):",
      ...verifiedFacts.map((f) => `- ${f.fact}`)
    );
  }

  const voiceExamples = facts.filter((f) => f.category === "voice_example");
  if (voiceExamples.length > 0) {
    sections.push(
      "",
      "Max's voice examples (style reference, not templates):",
      ...voiceExamples.map((f) => `- ${f.fact}`)
    );
  }

  return sections.join("\n");
}

/**
 * External provider interface for future gbrain/database integration.
 * Currently returns null; can be wired to external systems when available.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchMaxContextFromExternalProvider(_input: {
  sourceText: string;
  sourceUrl: string;
}): Promise<MaxContextFact[] | null> {
  // Future: wire to gbrain, database, or other external context systems
  // For now, return null to use the built-in facts above
  return null;
}
