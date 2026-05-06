export type ArticleControlKind = "select" | "number" | "boolean" | "text";

export type ArticleGenerationControl = {
  id: string;
  label: string;
  enabled: boolean;
  quick: boolean;
  kind: ArticleControlKind;
  value: string | number | boolean;
  options?: Array<{ value: string; label: string; description?: string }>;
  description?: string;
  removable?: boolean;
};

export type ArticleGenerationSettings = {
  defaults: {
    targetChars: number;
    targetWords: number;
    format: string;
    research: boolean;
    includeSources: boolean;
    heroImageMode: string;
    imageModel: string;
    imageOverlay: boolean;
    footer: boolean;
    seo: boolean;
    quality: string;
    writerProvider: string;
    tone: string;
    language: string;
  };
  controls: ArticleGenerationControl[];
  formatPresets: Array<{ id: string; label: string; prompt: string; description: string }>;
};

export type ArticleGenerationOptions = ArticleGenerationSettings["defaults"] & {
  customDirectives: Array<{ label: string; value: string | number | boolean }>;
};

export type ArticleGenerationSettingsInput = Omit<Partial<ArticleGenerationSettings>, "defaults"> & {
  defaults?: Partial<ArticleGenerationSettings["defaults"]>;
};

export const ARTICLE_LENGTH_PRESETS = [
  { value: "4200", label: "Short", description: "~700 words / fast draft" },
  { value: "8000", label: "Standard", description: "~1.3k words / normal article" },
  { value: "12000", label: "Deep", description: "~2k words / source-of-truth" },
  { value: "18000", label: "Long", description: "~3k words / exhaustive" },
];

const FORMAT_PRESETS = [
  {
    id: "medium",
    label: "Medium-ready",
    description: "Markdown, hero image, inline links, sources, footer/bio.",
    prompt: "Format as a Medium-ready article with clean Markdown, a strong title/dek, inline citations, a sources section, and a bio/footer when enabled. Keep prose blockquotes as blockquotes, not fenced code; collapse wrapped blockquote/prose lines into one paragraph before export.",
  },
  {
    id: "source-of-truth",
    label: "Source-of-truth",
    description: "Direct answer, thesis/tension, definitions, comparison, checklist, FAQ, action close.",
    prompt: "Use the source-of-truth structure: direct answer, thesis/tension, definitions, evidence map, comparison, checklist, FAQ, limitations, and action close.",
  },
  {
    id: "builder-guide",
    label: "Practical builder guide",
    description: "Problem, constraints, implementation steps, trade-offs, mistakes, checklist.",
    prompt: "Write a practical builder guide: problem, constraints, implementation steps, trade-offs, mistakes, validation checklist, and next actions.",
  },
  {
    id: "founder-essay",
    label: "Founder essay",
    description: "Narrative hook, argument, counterargument, operating lesson, action close.",
    prompt: "Write an opinionated founder essay with a narrative hook, clear argument, counterargument, operating lesson, and action close.",
  },
  {
    id: "research-explainer",
    label: "Research explainer",
    description: "Direct answer, evidence map, examples, limitations, FAQ, sources.",
    prompt: "Write a research-backed explainer with a direct answer, evidence map, concrete examples, limitations, FAQ, and sources.",
  },
  {
    id: "product-update",
    label: "Product/update",
    description: "What changed, why it matters, how to use it, rollout notes, next actions.",
    prompt: "Write a product/update article: what changed, why it matters, how to use it, examples, rollout notes, and next actions.",
  },
  {
    id: "thread-seed",
    label: "Thread seed",
    description: "Article optimized to repurpose into X/LinkedIn hooks and threads.",
    prompt: "Write the article so it can be repurposed into X/LinkedIn: strong section hooks, quotable claims, concrete examples, and short recap bullets.",
  },
];

export const DEFAULT_ARTICLE_GENERATION_SETTINGS: ArticleGenerationSettings = {
  defaults: {
    targetChars: 8000,
    targetWords: charsToWords(8000),
    format: "medium",
    research: true,
    includeSources: true,
    heroImageMode: "agent",
    imageModel: "gemini",
    imageOverlay: true,
    footer: true,
    seo: true,
    quality: "balanced",
    writerProvider: "auto",
    tone: "max-builder",
    language: "en",
  },
  controls: [
    {
      id: "length",
      label: "Length",
      enabled: true,
      quick: true,
      kind: "select",
      value: "8000",
      options: ARTICLE_LENGTH_PRESETS,
      description: "Character target in the UI; converted to words for the current backend.",
    },
    {
      id: "research",
      label: "Research",
      enabled: true,
      quick: true,
      kind: "boolean",
      value: true,
      description: "Run web/deep research before drafting.",
    },
    {
      id: "sources",
      label: "Sources",
      enabled: true,
      quick: true,
      kind: "boolean",
      value: true,
      description: "Include a sources section and source links.",
    },
    {
      id: "heroImage",
      label: "Hero image",
      enabled: true,
      quick: true,
      kind: "select",
      value: "agent",
      options: [
        { value: "agent", label: "Agent" },
        { value: "url", label: "Use URL/drop" },
        { value: "none", label: "None" },
      ],
      description: "Choose whether the article agent should create or expect a hero image.",
    },
    {
      id: "format",
      label: "Format",
      enabled: true,
      quick: true,
      kind: "select",
      value: "medium",
      options: FORMAT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label, description: preset.description })),
      description: "Article structure preset from the Medium automation workflow.",
    },
    {
      id: "writerProvider",
      label: "Writer model",
      enabled: true,
      quick: false,
      kind: "select",
      value: "auto",
      options: [
        { value: "auto", label: "Auto/default" },
        { value: "openai", label: "OpenAI" },
        { value: "gemini", label: "Gemini" },
        { value: "anthropic", label: "Anthropic" },
        { value: "glm", label: "GLM" },
      ],
      description: "Provider hint. Only honored when the backend path supports provider selection.",
    },
    {
      id: "imageModel",
      label: "Image model",
      enabled: true,
      quick: false,
      kind: "select",
      value: "gemini",
      options: [
        { value: "gemini", label: "Gemini image" },
        { value: "openai", label: "OpenAI image" },
        { value: "existing", label: "Existing URL/upload" },
        { value: "none", label: "None" },
      ],
      description: "Hero image model/mode for future image adapters.",
    },
    {
      id: "imageOverlay",
      label: "Image overlay",
      enabled: true,
      quick: false,
      kind: "boolean",
      value: true,
      description: "Add a title/visual overlay to generated hero images.",
    },
    {
      id: "tone",
      label: "Tone",
      enabled: true,
      quick: false,
      kind: "select",
      value: "max-builder",
      options: [
        { value: "max-builder", label: "Max builder" },
        { value: "technical-explainer", label: "Technical explainer" },
        { value: "founder-essay", label: "Founder essay" },
        { value: "practical-guide", label: "Practical guide" },
      ],
      description: "Voice preset passed into the article prompt.",
    },
    {
      id: "seo",
      label: "SEO/AEO",
      enabled: true,
      quick: false,
      kind: "boolean",
      value: true,
      description: "Include SEO/AEO answerability and FAQ guidance.",
    },
    {
      id: "footer",
      label: "Bio/footer",
      enabled: true,
      quick: false,
      kind: "boolean",
      value: true,
      description: "Append Medium bio/footer when available.",
    },
    {
      id: "quality",
      label: "Quality",
      enabled: true,
      quick: false,
      kind: "select",
      value: "balanced",
      options: [
        { value: "fast", label: "Fast draft" },
        { value: "balanced", label: "Balanced" },
        { value: "max", label: "Max quality" },
      ],
      description: "Maps to 1 / 3 / 5 generation iterations.",
    },
    {
      id: "language",
      label: "Language",
      enabled: true,
      quick: false,
      kind: "text",
      value: "en",
      description: "Language code or instruction.",
    },
  ],
  formatPresets: FORMAT_PRESETS,
};

export function charsToWords(chars: number) {
  const safeChars = Number.isFinite(chars) ? chars : 8000;
  return Math.max(800, Math.min(5000, Math.round(safeChars / 6)));
}

export function normalizeArticleGenerationSettings(
  input?: ArticleGenerationSettingsInput | null
): ArticleGenerationSettings {
  const defaultById = new Map(DEFAULT_ARTICLE_GENERATION_SETTINGS.controls.map((control) => [control.id, control]));
  const incomingById = new Map((input?.controls ?? []).map((control) => [control.id, control]));
  const controls: ArticleGenerationControl[] = [];

  for (const defaultControl of DEFAULT_ARTICLE_GENERATION_SETTINGS.controls) {
    controls.push(normalizeControl({ ...defaultControl, ...(incomingById.get(defaultControl.id) ?? {}) }));
  }

  for (const incoming of input?.controls ?? []) {
    if (!defaultById.has(incoming.id)) {
      controls.push(normalizeControl({ ...incoming, removable: incoming.removable ?? true }));
    }
  }

  const defaults = {
    ...DEFAULT_ARTICLE_GENERATION_SETTINGS.defaults,
    ...(input?.defaults ?? {}),
  };

  if (input?.defaults) {
    applyDefaultValuesToControls(controls, input.defaults);
  }

  const lengthControl = controls.find((control) => control.id === "length");
  const targetChars = numberValue(lengthControl?.value ?? defaults.targetChars, defaults.targetChars);
  const normalizedDefaults = {
    ...defaults,
    targetChars,
    targetWords: charsToWords(targetChars),
    research: booleanValue(controls.find((control) => control.id === "research")?.value, defaults.research),
    includeSources: booleanValue(controls.find((control) => control.id === "sources")?.value, defaults.includeSources),
    heroImageMode: stringValue(controls.find((control) => control.id === "heroImage")?.value, defaults.heroImageMode),
    format: stringValue(controls.find((control) => control.id === "format")?.value, defaults.format),
    writerProvider: stringValue(controls.find((control) => control.id === "writerProvider")?.value, defaults.writerProvider),
    imageModel: stringValue(controls.find((control) => control.id === "imageModel")?.value, defaults.imageModel),
    imageOverlay: booleanValue(controls.find((control) => control.id === "imageOverlay")?.value, defaults.imageOverlay),
    tone: stringValue(controls.find((control) => control.id === "tone")?.value, defaults.tone),
    seo: booleanValue(controls.find((control) => control.id === "seo")?.value, defaults.seo),
    footer: booleanValue(controls.find((control) => control.id === "footer")?.value, defaults.footer),
    quality: stringValue(controls.find((control) => control.id === "quality")?.value, defaults.quality),
    language: stringValue(controls.find((control) => control.id === "language")?.value, defaults.language),
  };

  return {
    defaults: normalizedDefaults,
    controls,
    formatPresets: input?.formatPresets?.length
      ? input.formatPresets
      : DEFAULT_ARTICLE_GENERATION_SETTINGS.formatPresets,
  };
}

export function getActiveArticleGenerationOptions(settings: ArticleGenerationSettings): ArticleGenerationOptions {
  const normalized = normalizeArticleGenerationSettings(settings);
  const customDirectives = normalized.controls
    .filter((control) => control.enabled && control.removable && control.id && control.value !== "")
    .map((control) => ({ label: control.label || control.id, value: control.value }));

  return {
    ...normalized.defaults,
    customDirectives,
  };
}

export function buildArticleGenerationDirectives(options: ArticleGenerationOptions) {
  const iterations = options.quality === "fast" ? 1 : options.quality === "max" ? 5 : 3;
  const imagesEnabled = options.heroImageMode !== "none" && options.imageModel !== "none";
  const linksMode = options.includeSources ? "both" : "inline";
  const directives = [
    `[length: ${options.targetWords}]`,
    `[research: ${String(options.research)}]`,
    `[sources: ${String(options.includeSources)}]`,
    `[links: ${linksMode}]`,
    `[images: ${String(imagesEnabled)}]`,
    `[image_overlay: ${String(options.imageOverlay)}]`,
    `[seo: ${String(options.seo)}]`,
    `[footer: ${String(options.footer)}]`,
    `[format: ${options.format === "medium" ? "medium" : "markdown"}]`,
    `[iterations: ${iterations}]`,
    `[language: ${options.language}]`,
  ];

  if (options.writerProvider && options.writerProvider !== "auto") {
    directives.push(`[provider: ${options.writerProvider}]`);
  }

  return directives;
}

export function buildArticleGenerationPromptPrefix(options: ArticleGenerationOptions) {
  const format = FORMAT_PRESETS.find((preset) => preset.id === options.format) ?? FORMAT_PRESETS[0];
  const tone = getToneInstruction(options.tone);
  const lines = [
    ...buildArticleGenerationDirectives(options),
    "",
    `Format preset: ${format.label}`,
    format.prompt,
    `Tone preset: ${tone}`,
    `Hero image: ${options.heroImageMode}`,
  ];

  if (options.imageModel && options.imageModel !== "none") {
    lines.push(`Image model preference: ${options.imageModel}`);
  }

  for (const directive of options.customDirectives) {
    lines.push(`${directive.label}: ${String(directive.value)}`);
  }

  return lines.join("\n").trim();
}

function applyDefaultValuesToControls(
  controls: ArticleGenerationControl[],
  defaults: Partial<ArticleGenerationSettings["defaults"]>
) {
  const updates: Record<string, string | number | boolean | undefined> = {
    length: defaults.targetChars,
    research: defaults.research,
    sources: defaults.includeSources,
    heroImage: defaults.heroImageMode,
    format: defaults.format,
    writerProvider: defaults.writerProvider,
    imageModel: defaults.imageModel,
    imageOverlay: defaults.imageOverlay,
    tone: defaults.tone,
    seo: defaults.seo,
    footer: defaults.footer,
    quality: defaults.quality,
    language: defaults.language,
  };

  for (const control of controls) {
    const value = updates[control.id];
    if (value !== undefined) control.value = value;
  }
}

function normalizeControl(control: ArticleGenerationControl): ArticleGenerationControl {
  const id = String(control.id || "custom").trim().replace(/\s+/g, "-");
  return {
    ...control,
    id,
    label: String(control.label || id),
    enabled: control.enabled !== false,
    quick: Boolean(control.quick),
    kind: ["select", "number", "boolean", "text"].includes(control.kind) ? control.kind : "text",
    value: control.value ?? "",
    options: Array.isArray(control.options) ? control.options : undefined,
  };
}

function numberValue(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "yes", "on", "1"].includes(value.toLowerCase())) return true;
    if (["false", "no", "off", "0"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function getToneInstruction(tone: string) {
  switch (tone) {
    case "technical-explainer":
      return "technical explainer: precise, concrete, implementation-aware";
    case "founder-essay":
      return "founder essay: opinionated, narrative, operationally useful";
    case "practical-guide":
      return "practical guide: stepwise, examples-first, low fluff";
    case "max-builder":
    default:
      return "Max builder: pragmatic, direct, technical, useful";
  }
}
