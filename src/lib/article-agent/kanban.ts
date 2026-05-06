export type ArticleKanbanColumn = {
  id: string;
  label: string;
  locked?: boolean;
};

export type ArticleKanbanState = {
  columns: ArticleKanbanColumn[];
  assignments: Record<string, string>;
  order: Record<string, string[]>;
  updatedAt?: string;
};

export const DEFAULT_ARTICLE_KANBAN_COLUMNS: ArticleKanbanColumn[] = [
  { id: "todo", label: "Todo", locked: true },
  { id: "in_progress", label: "In progress", locked: true },
  { id: "complete", label: "Complete", locked: true },
];

export function normalizeArticleKanbanState(
  input: Partial<ArticleKanbanState> | null | undefined,
  articleSlugs: string[],
  fallbackAssignments: Record<string, string> = {}
): ArticleKanbanState {
  const slugSet = new Set(articleSlugs);
  const columns = normalizeColumns(input?.columns);
  const columnIds = new Set(columns.map((column) => column.id));
  const assignments: Record<string, string> = {};

  for (const slug of articleSlugs) {
    const requested = input?.assignments?.[slug] || fallbackAssignments[slug] || "todo";
    assignments[slug] = columnIds.has(requested) ? requested : "todo";
  }

  const order = normalizeOrder(input?.order, columns, articleSlugs, assignments, slugSet);

  return {
    columns,
    assignments,
    order,
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : undefined,
  };
}

export function getArticleKanbanCardOpenView() {
  return "files" as const;
}

export function makeArticleKanbanColumnId(label: string, existingIds: string[]) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "column";
  const used = new Set(existingIds);
  if (!used.has(base)) return base;

  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function normalizeColumns(inputColumns: ArticleKanbanColumn[] | undefined) {
  const defaultIds = new Set(DEFAULT_ARTICLE_KANBAN_COLUMNS.map((column) => column.id));
  const columns = DEFAULT_ARTICLE_KANBAN_COLUMNS.map((column) => ({ ...column }));
  const seen = new Set(columns.map((column) => column.id));

  for (const column of inputColumns ?? []) {
    const id = cleanColumnId(column.id);
    const label = cleanColumnLabel(column.label);
    if (!id || !label || seen.has(id) || defaultIds.has(id)) continue;
    columns.push({ id, label });
    seen.add(id);
  }

  return columns;
}

function normalizeOrder(
  inputOrder: Record<string, string[]> | undefined,
  columns: ArticleKanbanColumn[],
  articleSlugs: string[],
  assignments: Record<string, string>,
  slugSet: Set<string>
) {
  const order: Record<string, string[]> = Object.fromEntries(columns.map((column) => [column.id, []]));
  const placed = new Set<string>();

  for (const column of columns) {
    for (const slug of inputOrder?.[column.id] ?? []) {
      if (!slugSet.has(slug) || placed.has(slug) || assignments[slug] !== column.id) continue;
      order[column.id].push(slug);
      placed.add(slug);
    }
  }

  for (const slug of articleSlugs) {
    if (placed.has(slug)) continue;
    const columnId = assignments[slug] ?? "todo";
    order[columnId] = order[columnId] ?? [];
    order[columnId].push(slug);
    placed.add(slug);
  }

  return order;
}

function cleanColumnId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function cleanColumnLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 48);
}
