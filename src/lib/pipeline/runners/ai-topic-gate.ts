import type { Story } from "../feed-engine";

/**
 * Deterministic AI-topic gate for feed story selection.
 *
 * The daily news lanes are branded "AI news", but the feed pool includes
 * general tech sources (HN, The Verge, Wired, Ars, TechCrunch, IEEE) that
 * frequently outrank AI stories on freshness + traction. This gate ensures
 * the image-post lanes only publish stories that are actually about AI.
 *
 * Matching is intentionally specific: bare "ai" and bare "model"/"agent"
 * are NOT included because they false-positive ("said", "email",
 * "fashion model", "real estate agent"). Terms are case-insensitive and
 * matched as substrings against title + summary + source name.
 */
export const AI_TOPIC_TERMS: ReadonlySet<string> = new Set([
  // Core AI terms (aligned with feed-engine DEFAULT_AI_KEYWORDS)
  "llm",
  "gpt",
  "claude",
  "ai agent",
  "ai agents",
  "rag",
  "transformer",
  "neural",
  "deep learning",
  "machine learning",
  "artificial intelligence",
  "generative ai",
  "foundation model",
  "large language model",
  "nlp",
  "openai",
  "anthropic",
  "mistral",
  "gemini",
  "llama",
  "embeddings",
  "vector database",
  "prompt engineering",
  "fine-tuning",
  "open weights",
  "inference",
  "context window",
  "multimodal",
  "reasoning",
  "chain of thought",
  // Model / product / research names
  "deepseek",
  "qwen",
  "copilot",
  "codex",
  "chatgpt",
  "midjourney",
  "sora",
  "dall-e",
  "groq",
  "cerebras",
  "cohere",
  "hugging face",
  "huggingface",
  "ollama",
  "whisper",
  "grok",
  "veo",
  "perplexity",
  "notebooklm",
  "stable diffusion",
  "apple intelligence",
  "deepmind",
  "neurips",
  "icml",
  "arxiv",
  // Phrased AI topics
  "ai model",
  "ai models",
  "ai startup",
  "ai research",
  "ai news",
  "ai video",
  "ai image",
  "ai chatbot",
  "ai assistant",
  "ai tools",
  "ai-powered",
  "ai safety",
  "agi",
]);

/** Feeds that are AI-focused by definition — used as a recall backstop. */
export const AI_SOURCE_ALLOWLIST: ReadonlySet<string> = new Set([
  "google ai",
  "openai",
  "anthropic",
  "meta ai",
  "huggingface",
  "hugging face",
  "lilian weng",
  "simon willison",
  "marktechpost",
  "kdnuggets",
  "langchain",
  "infoq ai",
  "synced",
  "venturebeat ai",
  "the batch",
  "bair",
]);

export function isAiTopicStory(
  story: Pick<Story, "title" | "summary" | "sourceName">
): boolean {
  const haystack = `${story.title ?? ""} ${story.summary ?? ""} ${story.sourceName ?? ""}`
    .toLowerCase();

  for (const term of AI_TOPIC_TERMS) {
    if (haystack.includes(term)) return true;
  }

  return AI_SOURCE_ALLOWLIST.has((story.sourceName ?? "").toLowerCase());
}
