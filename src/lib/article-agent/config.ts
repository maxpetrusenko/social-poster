import "server-only";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_ARTICLE_GENERATION_SETTINGS,
  normalizeArticleGenerationSettings,
  type ArticleGenerationSettings,
  type ArticleGenerationSettingsInput,
} from "./options";

export type ArticleAgentSkill = {
  name: string;
  content: string;
};

export type ArticleAgentSettings = {
  promptPath: string;
  skillsPath: string;
  generationSettingsPath: string;
  prompt: string;
  skills: ArticleAgentSkill[];
  generation: ArticleGenerationSettings;
  defaults: {
    tone: string;
    language: string;
    personality: string;
    targetWords: number;
  };
  providers: {
    mediumAutomationConfigured: boolean;
    mediumAutomationApiUrl: string;
    hasMediumAutomationApiKey: boolean;
    openAiConfigured: boolean;
  };
};

const ARTICLE_AGENT_DIR = path.join(process.cwd(), "article-agent");
const PROMPT_PATH = path.join(ARTICLE_AGENT_DIR, "prompt.md");
const SKILLS_PATH = path.join(ARTICLE_AGENT_DIR, "skills");
const GENERATION_SETTINGS_PATH = path.join(ARTICLE_AGENT_DIR, "generation-settings.json");

export async function loadArticleAgentSettings(): Promise<ArticleAgentSettings> {
  const [prompt, skills, generation] = await Promise.all([
    readFile(PROMPT_PATH, "utf8").catch(() => defaultPrompt()),
    loadSkills(),
    loadArticleGenerationSettings(),
  ]);
  const mediumAutomationApiUrl =
    process.env.MEDIUM_AUTOMATION_API_URL?.replace(/\/+$/, "") || "";
  const hasMediumAutomationApiKey = Boolean(process.env.MEDIUM_AUTOMATION_API_KEY);

  return {
    promptPath: PROMPT_PATH,
    skillsPath: SKILLS_PATH,
    generationSettingsPath: GENERATION_SETTINGS_PATH,
    prompt,
    skills,
    generation,
    defaults: {
      tone: process.env.ARTICLE_AGENT_TONE || "clear, specific, evidence-aware",
      language: process.env.ARTICLE_AGENT_LANGUAGE || "en",
      personality:
        process.env.ARTICLE_AGENT_PERSONALITY ||
        "Max Petrusenko: pragmatic builder, direct, technical, useful",
      targetWords: Number(process.env.ARTICLE_AGENT_TARGET_WORDS || 2000),
    },
    providers: {
      mediumAutomationConfigured: Boolean(
        mediumAutomationApiUrl && hasMediumAutomationApiKey
      ),
      mediumAutomationApiUrl,
      hasMediumAutomationApiKey,
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
  };
}

export async function buildArticleAgentInstructionBlock() {
  const settings = await loadArticleAgentSettings();
  const skills = settings.skills
    .map((skill) => `## Skill: ${skill.name}\n\n${skill.content.trim()}`)
    .join("\n\n");

  return [
    "ARTICLE AGENT SETTINGS",
    `Tone: ${settings.defaults.tone}`,
    `Language: ${settings.defaults.language}`,
    `Personality: ${settings.defaults.personality}`,
    "",
    settings.prompt.trim(),
    skills ? `\nARTICLE AGENT SKILLS\n\n${skills}` : "",
  ].join("\n");
}

export async function loadArticleGenerationSettings() {
  const raw = await readFile(GENERATION_SETTINGS_PATH, "utf8").catch(() => "");
  if (!raw.trim()) return normalizeArticleGenerationSettings(DEFAULT_ARTICLE_GENERATION_SETTINGS);
  try {
    return normalizeArticleGenerationSettings(JSON.parse(raw) as ArticleGenerationSettingsInput);
  } catch {
    return normalizeArticleGenerationSettings(DEFAULT_ARTICLE_GENERATION_SETTINGS);
  }
}

export async function saveArticleGenerationSettings(settings: ArticleGenerationSettingsInput) {
  const normalized = normalizeArticleGenerationSettings(settings);
  await mkdir(ARTICLE_AGENT_DIR, { recursive: true });
  await writeFile(GENERATION_SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

async function loadSkills() {
  const entries = await readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (file) => ({
      name: file.replace(/\.md$/, ""),
      content: await readFile(path.join(SKILLS_PATH, file), "utf8"),
    }))
  );
}

function defaultPrompt() {
  return "Create a source-backed Markdown article with title, subtitle, hero image, sections, sources, limitations, and clear actions.";
}
