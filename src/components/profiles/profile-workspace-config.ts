export type WorkspaceNode = {
  type: "file" | "folder";
  content?: string;
  system?: boolean;
};

export type WorkspaceTree = Record<string, WorkspaceNode>;

export type ProfileWorkspace = {
  activePath?: string;
  tree?: WorkspaceTree;
  documents?: Record<string, string>;
  activeDocumentId?: string;
};

export type ProfileConfig = Record<string, unknown> & {
  profileWorkspace?: ProfileWorkspace;
};

export type Profile = {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  voiceId: string | null;
  faceId: string | null;
  tone: string | null;
  isDefault: boolean;
  config?: ProfileConfig | null;
};

export type TreeEntry = {
  path: string;
  name: string;
  depth: number;
  node: WorkspaceNode;
};

export const ROOT_PATH = "";
export const DEFAULT_ACTIVE_PATH = "business-dna.md";
export const CHANNELS_PATH = "platforms";
export const CAMPAIGNS_PATH = `${CHANNELS_PATH}/campaigns`;

export const PROTECTED_PATHS = new Set([
  "business-dna.md",
  "posting-style.md",
  "agents.md",
  "memory.md",
  CAMPAIGNS_PATH,
]);

const LEGACY_PREFIX = "global/";

export function normalizeWorkspace(profile: Profile): {
  tree: WorkspaceTree;
  activePath: string;
} {
  const workspace = profile.config?.profileWorkspace;
  const tree = normalizeTree(workspace?.tree);
  migrateCampaignsIntoChannels(tree);

  if (Object.keys(tree).length === 0) {
    seedDefaultTree(tree, profile);
  }

  if (workspace?.documents) {
    for (const [legacyPath, content] of Object.entries(workspace.documents)) {
      const path = normalizeLegacyPath(legacyPath);
      if (!path || tree[path]?.type === "folder") continue;
      ensureParentFolders(tree, path);
      tree[path] = {
        type: "file",
        content,
        system: PROTECTED_PATHS.has(path),
      };
    }
  }

  for (const path of Object.keys(tree)) {
    ensureParentFolders(tree, path);
  }

  const activePath =
    normalizeLegacyPath(workspace?.activePath ?? workspace?.activeDocumentId ?? "") ||
    DEFAULT_ACTIVE_PATH;

  return {
    tree,
    activePath: tree[activePath] ? activePath : DEFAULT_ACTIVE_PATH,
  };
}

export function serializeWorkspace(tree: WorkspaceTree, activePath: string): ProfileWorkspace {
  return { activePath, tree };
}

export function listChildren(tree: WorkspaceTree, parentPath: string): TreeEntry[] {
  const normalizedParent = trimSlashes(parentPath);
  return Object.entries(tree)
    .filter(([path]) => path !== normalizedParent)
    .filter(([path]) => !isHiddenInProfileEditor(path))
    .filter(([path]) => {
      const parent = parentOf(path);
      return parent === normalizedParent;
    })
    .map(([path, node]) => ({
      path,
      name: basename(path),
      depth: path ? path.split("/").length - 1 : 0,
      node,
    }))
    .sort((a, b) => {
      if (a.node.type !== b.node.type) return a.node.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function visibleEntries(tree: WorkspaceTree, openFolders: Record<string, boolean>) {
  const entries: TreeEntry[] = [];

  function walk(parentPath: string) {
    for (const child of listChildren(tree, parentPath)) {
      entries.push(child);
      if (child.node.type === "folder" && openFolders[child.path]) {
        walk(child.path);
      }
    }
  }

  walk(ROOT_PATH);
  return entries;
}

export function campaignEntries(tree: WorkspaceTree) {
  return Object.entries(tree)
    .filter(([path, node]) => node.type === "file" && isCampaignPath(path))
    .map(([path, node]) => ({ path, node }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function sanitizeName(input: string, fallback: string, wantFile: boolean) {
  const cleaned = input
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
  const value = cleaned || fallback;
  if (!wantFile) return value.replace(/\.md$/i, "");
  return value.toLowerCase().endsWith(".md") ? value : `${value}.md`;
}

export function childPath(parentPath: string, name: string) {
  const parent = trimSlashes(parentPath);
  const cleanName = trimSlashes(name);
  return parent ? `${parent}/${cleanName}` : cleanName;
}

export function uniquePath(tree: WorkspaceTree, desiredPath: string) {
  const clean = trimSlashes(desiredPath);
  if (!tree[clean]) return clean;
  const parent = parentOf(clean);
  const base = basename(clean);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let index = 2;
  while (true) {
    const candidate = childPath(parent, `${stem}-${index}${ext}`);
    if (!tree[candidate]) return candidate;
    index += 1;
  }
}

export function parentOf(path: string) {
  const clean = trimSlashes(path);
  const index = clean.lastIndexOf("/");
  return index > 0 ? clean.slice(0, index) : ROOT_PATH;
}

export function basename(path: string) {
  const clean = trimSlashes(path);
  return clean.split("/").filter(Boolean).at(-1) ?? "Profiles";
}

export function displayNameForPath(path: string, fallback = basename(path)) {
  if (path === CHANNELS_PATH) return "channels";
  return fallback;
}

export function isDescendant(path: string, possibleParent: string) {
  const cleanPath = trimSlashes(path);
  const cleanParent = trimSlashes(possibleParent);
  return cleanPath !== cleanParent && cleanPath.startsWith(`${cleanParent}/`);
}

export function cloneSubtree(tree: WorkspaceTree, sourcePath: string, targetPath: string) {
  const next: WorkspaceTree = {};
  for (const [path, node] of Object.entries(tree)) {
    if (path === sourcePath || isDescendant(path, sourcePath)) {
      const suffix = path === sourcePath ? "" : path.slice(sourcePath.length);
      next[`${targetPath}${suffix}`] = { ...node, system: false };
    }
  }
  return next;
}

export function deleteSubtree(tree: WorkspaceTree, path: string) {
  const next = { ...tree };
  for (const key of Object.keys(next)) {
    if (key === path || isDescendant(key, path)) delete next[key];
  }
  return next;
}

export function moveSubtree(tree: WorkspaceTree, sourcePath: string, targetPath: string) {
  const subtree = cloneSubtree(tree, sourcePath, targetPath);
  const next = deleteSubtree(tree, sourcePath);
  return { ...next, ...subtree };
}

export function defaultFileContent(profile: Profile, path: string) {
  const name = profile.name || "CompanyName";
  const platform = platformLabel(path);
  const file = basename(path);

  if (path === "business-dna.md") {
    return `# ${name} Business DNA\n\n## Overview\n- What we do:\n- Who we serve:\n- Primary offer:\n- Why now:\n\n## Positioning\n- Category:\n- Differentiator:\n- Competitors:\n- Proof points:\n\n## Boundaries\n- Claims to avoid:\n- Topics to avoid:\n- Required disclaimers:\n`;
  }
  if (path === "website.md") {
    return "# Website\n\nURL:\n\n## Crawl Output\n- Tagline:\n- Business overview:\n- Fonts:\n- Colors:\n- Logos:\n- Social links:\n\n## Source Pages\n- Homepage:\n- About:\n- Product or services:\n- Blog or case studies:\n";
  }
  if (path === "posting-style.md") {
    return `# Posting Style\n\n## Tone\n- Default tone: ${profile.tone ?? "direct, useful, specific"}\n- Language:\n- Reading level:\n- Energy:\n\n## Structure\n- Hook style:\n- Body style:\n- CTA style:\n- Hashtag rules:\n\n## Voice Rules\n- Use concrete examples.\n- Prefer specific claims over vague adjectives.\n- Keep platform-native formatting.\n`;
  }
  if (path === "skills/ad-creative.md") {
    return "# Ad Creative Skill\n\n## Use When\nGenerate or iterate social post styles, paid-social captions, hooks, creative angles, and platform-specific variants.\n\n## Angle Bank\n- Pain point\n- Outcome\n- Social proof\n- Curiosity\n- Comparison\n- Identity\n- Contrarian\n\n## Quality Bar\n- Specific over vague.\n- Benefits over features.\n- Active voice.\n- Character limits enforced per platform.\n\n## Platform Starts\n- Meta: front-load hook in first 125 characters.\n- LinkedIn: professional, data-backed, role-aware.\n- TikTok: native, visual, first 2 seconds matter.\n- X: short, conversational, one clear point.\n";
  }
  if (path === "agents.md") {
    return `# Agents\n\n## Default Agent Rules\n- Preserve ${name}'s voice before optimizing for novelty.\n- Ask for sources when a claim sounds risky.\n- Generate platform-native variants instead of copy-pasting one caption.\n- Use assets and examples as style references.\n`;
  }
  if (path === "memory.md") return "# Memory\n\n## Durable Preferences\n- \n\n## Learnings\n- \n\n## Do Not Repeat\n- \n";
  if (path === "knowledgebase/index.md") return "# Knowledgebase\n\n## Reusable Facts\n- \n\n## Source Links\n- \n\n## Claims With Proof\n- \n";
  if (path === "api-keys.md") return "# API Keys\n\nSecrets should be stored as references, not raw values.\n\n## Profile Defaults\n- OpenAI:\n- Anthropic:\n- Gemini:\n- Image generation:\n- Voice:\n\n## Overrides\n- \n";
  if (path === "voices.md") {
    return `# Voices\n\n## Spoken Voice\n- Cartesia voice ID: ${profile.voiceId ?? ""}\n- Pace:\n- Energy:\n- Accent:\n\n## Avatar\n- Simli face ID: ${profile.faceId ?? ""}\n- Visual style:\n\n## Tone References\n- Calm expert:\n- Founder POV:\n- Punchy launch:\n`;
  }
  if (path.startsWith(`${CAMPAIGNS_PATH}/`) && basename(path) === "campaign.md") {
    return defaultCampaignContent(profile, campaignTitleFromPath(path));
  }
  if (platform) {
    return `# ${platform} ${file}\n\nOverrides root profile defaults only where ${platform} needs different behavior.\n\n## Override\n- Posting style:\n- Hook pattern:\n- Length:\n- Formatting:\n- Image rules:\n- CTA:\n\n## Examples\n- \n`;
  }
  return `# ${file.replace(/\.md$/i, "")}\n\n`;
}

export function defaultCampaignContent(profile: Profile, title: string) {
  const campaignTitle = title || `${profile.name} Campaign`;
  return `# ${campaignTitle}\n\nStatus: draft\nHeader: ${campaignTitle}\nDescription: A profile-aware creative concept for ${profile.name}.\nVisual prompt: Wide source image with extra environment around the subject, clean negative space, and a centered safe zone for platform crops.\nImage seed: ${slugify(campaignTitle)}\nAnimation: none\n\n## Platform Crops\n- Instagram square 1080x1080: draft\n- Instagram portrait 1080x1350: draft\n- Instagram landscape 1080x566: draft\n- X 1600x900: draft\n- LinkedIn 1200x627: draft\n- Pinterest 1000x1500: draft\n\n## Notes\n- Generate the source image wider than the final square composition.\n- Keep the subject inside the center safe zone so every platform crop works.\n- Reuse the same approved source image across platform formats.\n`;
}

export function isCampaignPath(path: string) {
  return path.startsWith(`${CAMPAIGNS_PATH}/`) && basename(path) === "campaign.md";
}

export function isCampaignFolder(path: string, tree: WorkspaceTree) {
  return path.startsWith(`${CAMPAIGNS_PATH}/`) && tree[path]?.type === "folder" && Boolean(tree[childPath(path, "campaign.md")]);
}

function normalizeTree(value: unknown): WorkspaceTree {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: WorkspaceTree = {};
  for (const [rawPath, rawNode] of Object.entries(value)) {
    const path = trimSlashes(rawPath);
    if (!path || !rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) continue;
    const node = rawNode as Record<string, unknown>;
    const type = node.type === "folder" ? "folder" : "file";
    result[path] = {
      type,
      content: type === "file" && typeof node.content === "string" ? node.content : undefined,
      system: node.system === true,
    };
  }
  return result;
}

function migrateCampaignsIntoChannels(tree: WorkspaceTree) {
  for (const path of Object.keys(tree)) {
    if (path === "campaigns") {
      delete tree[path];
      continue;
    }
    if (!path.startsWith("campaigns/")) continue;
    const nextPath = path.replace(/^campaigns\//, `${CAMPAIGNS_PATH}/`);
    tree[nextPath] = tree[path];
    delete tree[path];
  }
}

function isHiddenInProfileEditor(path: string) {
  return path === CAMPAIGNS_PATH || path.startsWith(`${CAMPAIGNS_PATH}/`);
}

function seedDefaultTree(tree: WorkspaceTree, profile: Profile) {
  const folders = [
    "assets",
    "assets/logos",
    "assets/screenshots",
    "assets/examples",
    "skills",
    "knowledgebase",
    CHANNELS_PATH,
    CAMPAIGNS_PATH,
    "platforms/x",
    "platforms/linkedin",
    "platforms/instagram",
    "platforms/tiktok",
    "platforms/pinterest",
    "platforms/reddit",
  ];
  for (const folder of folders) tree[folder] = { type: "folder" };

  const files = [
    "business-dna.md",
    "website.md",
    "posting-style.md",
    "skills/ad-creative.md",
    "agents.md",
    "memory.md",
    "knowledgebase/index.md",
    "api-keys.md",
    "voices.md",
    "platforms/x/posting-style.md",
    "platforms/linkedin/posting-style.md",
    "platforms/instagram/posting-style.md",
    "platforms/tiktok/posting-style.md",
    "platforms/pinterest/posting-style.md",
    "platforms/reddit/posting-style.md",
  ];
  for (const file of files) {
    tree[file] = {
      type: "file",
      content: defaultFileContent(profile, file),
      system: PROTECTED_PATHS.has(file),
    };
  }
}

function ensureParentFolders(tree: WorkspaceTree, path: string) {
  const parts = trimSlashes(path).split("/");
  parts.pop();
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!tree[current]) tree[current] = { type: "folder" };
  }
}

function normalizeLegacyPath(path: string) {
  const clean = trimSlashes(path)
    .replace(/^platforms\/linkedin_personal\//, "platforms/linkedin/")
    .replace(/^campaigns\//, `${CAMPAIGNS_PATH}/`);
  if (!clean) return "";
  if (clean.startsWith(LEGACY_PREFIX)) {
    const withoutGlobal = clean.slice(LEGACY_PREFIX.length);
    if (withoutGlobal === "assets/README.md") return "assets/README.md";
    return withoutGlobal;
  }
  return clean;
}

function platformLabel(path: string) {
  const parts = trimSlashes(path).split("/");
  if (parts[0] !== "platforms") return "";
  const label = parts[1] ?? "";
  if (label === "x") return "X";
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : "";
}

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function campaignTitleFromPath(path: string) {
  const parts = trimSlashes(path).split("/");
  const slug = parts[1] ?? "campaign";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "campaign";
}
