"use client";

/* eslint-disable @next/next/no-img-element -- Article workspace renders arbitrary archived local/external artifact images; next/image domain allowlists break the file-system viewer. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  File,
  FileJson,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  ImageIcon,
  KanbanSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { ArticleWorkspaceTextPanel } from "./article-workspace-text-panel";
import {
  type ArticleWorkspaceArticleSummary,
  type ArticleWorkspaceKanbanColumn,
  type ArticleWorkspacePreview,
  type ArticleWorkspaceSectionTree,
  type ArticleWorkspaceTreeNode,
} from "@/lib/article-agent/workspace";
import { getArticleKanbanCardOpenView } from "@/lib/article-agent/kanban";
import { cn } from "@/lib/utils";

type ArticleWorkspaceProps = {
  trees: ArticleWorkspaceSectionTree[];
  preview: ArticleWorkspacePreview;
  articles: ArticleWorkspaceArticleSummary[];
  kanbanColumns: ArticleWorkspaceKanbanColumn[];
};

type WorkspaceMenuTarget = {
  openRef: string;
  name: string;
  kind: "directory" | "file";
  root: boolean;
};

type WorkspaceMenu = {
  x: number;
  y: number;
  target: WorkspaceMenuTarget;
};

type ArticleWorkspaceView = "files" | "kanban";
type DraggedArticle = { slug: string; columnId: string } | null;

const COLLAPSED_DIRECTORY_STORAGE_KEY = "social-poster.article-workspace.collapsed-directories.v1";

export function ArticleWorkspace({ trees, preview, articles, kanbanColumns }: ArticleWorkspaceProps) {
  const router = useRouter();
  const [treeHidden, setTreeHidden] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readStoredOpenRefSet(COLLAPSED_DIRECTORY_STORAGE_KEY));
  const [menu, setMenu] = useState<WorkspaceMenu | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ArticleWorkspaceView>("files");
  const [columns, setColumns] = useState(kanbanColumns);
  const [kanbanArticles, setKanbanArticles] = useState(articles);
  const [draggedArticle, setDraggedArticle] = useState<DraggedArticle>(null);
  const directoryRefs = useMemo(() => collectDirectoryRefs(trees), [trees]);
  const filteredArticles = useMemo(() => filterArticles(kanbanArticles, query), [kanbanArticles, query]);
  const treeFilter = useMemo(() => filterWorkspaceTrees(trees, query), [trees, query]);

  useEffect(() => {
    setColumns(kanbanColumns);
  }, [kanbanColumns]);

  useEffect(() => {
    setKanbanArticles(articles);
  }, [articles]);

  useEffect(() => {
    setCollapsed((current) => {
      const next = new Set(current);
      for (const openRef of current) {
        if (!directoryRefs.has(openRef)) next.delete(openRef);
      }
      return next.size === current.size ? current : next;
    });
  }, [directoryRefs]);

  useEffect(() => {
    writeStoredOpenRefSet(COLLAPSED_DIRECTORY_STORAGE_KEY, collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  function toggleDirectory(openRef: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(openRef)) next.delete(openRef);
      else next.add(openRef);
      return next;
    });
  }

  function openContextMenu(event: React.MouseEvent, target: WorkspaceMenuTarget) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, target });
  }

  async function runAction(action: "edit" | "new-file" | "new-folder" | "rename" | "delete") {
    if (!menu) return;
    const target = menu.target;
    setMenu(null);

    if (action === "edit") {
      router.push(`/dashboard/articles?open=${encodeURIComponent(target.openRef)}`);
      return;
    }

    if (action === "new-file" || action === "new-folder") {
      const rawName = window.prompt(action === "new-file" ? "File name" : "Folder name");
      if (!rawName) return;
      const name = action === "new-file" && !rawName.includes(".") ? `${rawName}.md` : rawName;
      const body = await mutateWorkspace("POST", {
        parentOpenRef: target.openRef,
        name,
        kind: action === "new-file" ? "file" : "directory",
        text: action === "new-file" ? "" : undefined,
      });
      if (body?.openRef) openRef(body.openRef);
      return;
    }

    if (action === "rename") {
      const name = window.prompt("Rename to", target.name);
      if (!name || name === target.name) return;
      const body = await mutateWorkspace("PUT", { openRef: target.openRef, name });
      if (body?.openRef) openRef(body.openRef);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Delete ${target.name}? It will move to workspace trash.`);
      if (!confirmed) return;
      const body = await mutateWorkspace("DELETE", { openRef: target.openRef });
      if (body?.openRef) openRef(body.openRef);
    }
  }

  async function mutateWorkspace(method: "POST" | "PUT" | "DELETE", body: Record<string, unknown>) {
    const response = await fetch("/api/article/fs", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { openRef?: string; error?: string };
    if (!response.ok || result.error) {
      window.alert(result.error || "Article workspace action failed.");
      return null;
    }
    return result;
  }

  function openRef(openRef: string) {
    router.push(`/dashboard/articles?open=${encodeURIComponent(openRef)}`);
    router.refresh();
  }

  function openArticleFromKanban(openRef: string) {
    setView(getArticleKanbanCardOpenView());
    setTreeHidden(false);
    setQuery("");
    router.push(`/dashboard/articles?open=${encodeURIComponent(openRef)}`);
  }

  function addKanbanColumn() {
    const label = window.prompt("New column name");
    if (!label?.trim()) return;
    const id = makeClientColumnId(label, columns.map((column) => column.id));
    const nextColumns = [...columns, { id, label: label.trim().replace(/\s+/g, " ").slice(0, 48) }];
    setColumns(nextColumns);
    void persistKanban(nextColumns, kanbanArticles);
  }

  function moveArticle(slug: string, targetColumnId: string, beforeSlug?: string) {
    setKanbanArticles((current) => {
      const moving = current.find((article) => article.slug === slug);
      if (!moving) return current;

      const targetLabel = columns.find((column) => column.id === targetColumnId)?.label ?? targetColumnId;
      const withoutMoving = current.filter((article) => article.slug !== slug);
      const updated = {
        ...moving,
        status: targetColumnId,
        statusLabel: targetLabel,
        searchText: appendSearchText(moving.searchText, targetLabel),
      };
      const beforeIndex = beforeSlug ? withoutMoving.findIndex((article) => article.slug === beforeSlug) : -1;
      const next = [...withoutMoving];
      if (beforeIndex >= 0) next.splice(beforeIndex, 0, updated);
      else next.push(updated);
      void persistKanban(columns, next);
      return next;
    });
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#d4c6b1] bg-white shadow-[0_18px_48px_rgba(23,23,23,0.05)]">
      <WorkspaceToolbar
        query={query}
        view={view}
        totalCount={view === "kanban" ? articles.length : treeFilter.totalCount}
        resultCount={view === "kanban" ? filteredArticles.length : treeFilter.visibleCount}
        onQueryChange={setQuery}
        onViewChange={setView}
        onAddColumn={addKanbanColumn}
      />
      {view === "kanban" ? (
        <ArticleKanban
          articles={filteredArticles}
          columns={columns}
          draggedArticle={draggedArticle}
          onDragStart={setDraggedArticle}
          onDropArticle={moveArticle}
          onOpenArticle={openArticleFromKanban}
        />
      ) : (
        <>
          <div className={cn("grid min-h-[720px]", treeHidden ? "xl:grid-cols-[minmax(0,1fr)]" : "xl:grid-cols-[360px_minmax(0,1fr)]")}>
        {treeHidden ? null : (
          <aside className="border-b border-[#eadfce] bg-[#fbf6ed] xl:border-b-0 xl:border-r">
            <div className="border-b border-[#eadfce] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label className="flex items-center gap-2 rounded-[14px] border border-[#d8cab5] bg-white px-3 py-2 shadow-[0_1px_0_rgba(23,23,23,0.03)]">
                    <Search className="h-4 w-4 shrink-0 text-[#806f58]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search article FS, artifacts, skills, wiki..."
                      className="min-w-0 flex-1 bg-transparent text-sm text-[#171717] outline-none placeholder:text-[#9b8b73]"
                    />
                  </label>
                  <p className="mt-2 truncate text-xs font-semibold text-[#806f58]">
                    {treeFilter.visibleCount} / {treeFilter.totalCount} visible files and folders
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTreeHidden(true)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8cab5] bg-white text-[#5f523f]"
                  aria-label="Hide folder structure"
                  title="Hide folder structure"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[680px] overflow-y-auto px-2 py-3 font-mono text-[12px] leading-5">
              {treeFilter.trees.length ? (
                treeFilter.trees.map((tree) => {
                const rootOpenRef = `${tree.section}:`;
                  const rootCollapsed = collapsed.has(rootOpenRef);

                return (
                  <div key={tree.section} className="mb-3">
                    <div
                      onContextMenu={(event) =>
                        openContextMenu(event, {
                          openRef: rootOpenRef,
                          name: tree.label,
                          kind: "directory",
                          root: true,
                        })
                      }
                      className={cn(
                        "flex items-center gap-1 rounded-[10px] px-1 py-1 font-semibold text-[#3d3328] hover:bg-white",
                        preview.section === tree.section && !preview.relativePath ? "bg-white text-[#0f7ea9]" : null
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleDirectory(rootOpenRef)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#806f58] hover:bg-[#f4ebdd]"
                        aria-label={rootCollapsed ? "Expand folder" : "Collapse folder"}
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !rootCollapsed && "rotate-90")} />
                      </button>
                      <Link
                        href={`/dashboard/articles?open=${encodeURIComponent(rootOpenRef)}`}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-1 py-0.5"
                      >
                        <Folder className="h-3.5 w-3.5 text-[#0f7ea9]" />
                        <span className="truncate">{tree.label}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={(event) =>
                          openContextMenu(event, {
                            openRef: rootOpenRef,
                            name: tree.label,
                            kind: "directory",
                            root: true,
                          })
                        }
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#806f58] hover:bg-[#f4ebdd]"
                        aria-label="Folder actions"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {tree.exists && !rootCollapsed ? (
                      <div className="ml-3 border-l border-[#eadfce] pl-2">
                        {tree.children.map((node) => (
                          <TreeNode
                            key={`${node.section}:${node.relativePath}`}
                            node={node}
                            activeOpenRef={preview.openRef}
                            collapsed={collapsed}
                            onToggle={toggleDirectory}
                            onContextMenu={openContextMenu}
                          />
                        ))}
                      </div>
                    ) : tree.exists ? null : (
                      <p className="ml-6 mt-1 rounded-[10px] bg-white px-2 py-1 text-[11px] text-[#9c3b2f]">
                        Missing: {tree.root}
                      </p>
                    )}
                  </div>
                );
              })
              ) : (
                <p className="mx-1 rounded-[12px] border border-[#eadfce] bg-white px-3 py-4 text-xs leading-5 text-[#806f58]">
                  No matching files. Try an article slug, version, artifact name, skill, or wiki term.
                </p>
              )}
            </div>
          </aside>
        )}

        <main className="flex min-w-0 flex-col bg-[#fffdf9]">
          <PreviewHeader preview={preview} treeHidden={treeHidden} onShowTree={() => setTreeHidden(false)} />
          <div className="min-h-0 flex-1">
            <PreviewBody preview={preview} articles={articles} query={query} />
          </div>
        </main>
          </div>
        </>
      )}
      {menu ? <ContextMenu menu={menu} onAction={(action) => void runAction(action)} /> : null}
    </section>
  );
}


function WorkspaceToolbar({
  query,
  view,
  totalCount,
  resultCount,
  onQueryChange,
  onViewChange,
  onAddColumn,
}: {
  query: string;
  view: ArticleWorkspaceView;
  totalCount: number;
  resultCount: number;
  onQueryChange: (value: string) => void;
  onViewChange: (value: ArticleWorkspaceView) => void;
  onAddColumn: () => void;
}) {
  return (
    <div className="border-b border-[#eadfce] bg-[#fbf6ed] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-[#d8cab5] bg-white p-1 text-xs font-semibold text-[#5f523f]">
          <button
            type="button"
            onClick={() => onViewChange("files")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
              view === "files" ? "bg-[#171717] text-white" : "hover:bg-[#fffaf2]"
            )}
          >
            <Folder className="h-3.5 w-3.5" />
            File system
          </button>
          <button
            type="button"
            onClick={() => onViewChange("kanban")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
              view === "kanban" ? "bg-[#171717] text-white" : "hover:bg-[#fffaf2]"
            )}
          >
            <KanbanSquare className="h-3.5 w-3.5" />
            Kanban
          </button>
        </div>
        {view === "kanban" ? (
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-[16px] border border-[#d8cab5] bg-white px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-[#806f58]" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search articles by name, year, platform, status, or context..."
              className="min-w-0 flex-1 bg-transparent text-sm text-[#171717] outline-none placeholder:text-[#9b8b73]"
            />
          </label>
        ) : (
          <div className="min-w-[260px] flex-1" />
        )}
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5f523f]">
          {resultCount} / {totalCount}
        </span>
        {view === "kanban" ? (
          <button
            type="button"
            onClick={onAddColumn}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#d8cab5] bg-white px-3 py-2 text-xs font-semibold text-[#5f523f] hover:bg-[#fffaf2]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add column
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ArticleKanban({
  articles,
  columns,
  draggedArticle,
  onDragStart,
  onDropArticle,
  onOpenArticle,
}: {
  articles: ArticleWorkspaceArticleSummary[];
  columns: ArticleWorkspaceKanbanColumn[];
  draggedArticle: DraggedArticle;
  onDragStart: (article: DraggedArticle) => void;
  onDropArticle: (slug: string, targetColumnId: string, beforeSlug?: string) => void;
  onOpenArticle: (openRef: string) => void;
}) {
  return (
    <div className="bg-[#fffdf9] p-4">
      <div className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {columns.map((column) => {
          const columnArticles = articles.filter((article) => article.status === column.id);
          return (
            <div
              key={column.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedArticle) onDropArticle(draggedArticle.slug, column.id);
              }}
              className="rounded-[18px] border border-[#eadfce] bg-[#fbf6ed]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#eadfce] px-3 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">{column.label}</h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#5f523f]">{columnArticles.length}</span>
              </div>
              <div className="max-h-[680px] space-y-3 overflow-auto p-3">
                {columnArticles.length ? (
                  columnArticles.map((article) => (
                    <ArticleCard
                      key={article.slug}
                      article={article}
                      onDragStart={() => onDragStart({ slug: article.slug, columnId: column.id })}
                      onDragEnd={() => onDragStart(null)}
                      onDropBefore={(slug) => onDropArticle(slug, column.id, article.slug)}
                      onOpen={() => onOpenArticle(article.openRef)}
                    />
                  ))
                ) : (
                  <p className="rounded-[14px] border border-[#eadfce] bg-white px-3 py-6 text-center text-sm text-[#806f58]">Drop articles here.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArticleCard({
  article,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onOpen,
}: {
  article: ArticleWorkspaceArticleSummary;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: (slug: string) => void;
  onOpen: () => void;
}) {
  return (
    <Link
      href={`/dashboard/articles?open=${encodeURIComponent(article.openRef)}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/article-slug", article.slug);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const slug = event.dataTransfer.getData("text/article-slug");
        if (slug && slug !== article.slug) onDropBefore(slug);
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.dataset.dragReady = "true";
      }}
      className="block cursor-grab rounded-[16px] border border-[#eadfce] bg-white p-3 text-[#171717] hover:border-[#c6b292] hover:bg-[#fffaf2] active:cursor-grabbing"
    >
      {article.heroImageUrl ? (
        <div className="mb-3 overflow-hidden rounded-[12px] border border-[#eadfce] bg-[#f4ebdd]">
          <img
            src={article.heroImageUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#0f7ea9]" />
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-semibold leading-5">{article.title}</h4>
          <p className="mt-1 truncate font-mono text-[11px] text-[#806f58]">{article.slug}</p>
        </div>
      </div>
      {article.subtitle ? (
        <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-[#3d3328]">{article.subtitle}</p>
      ) : null}
      {article.context && article.context !== article.subtitle ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#5f523f]">{article.context}</p> : null}
      <ArticleMeta article={article} />
    </Link>
  );
}

function ArticleMeta({ article }: { article: ArticleWorkspaceArticleSummary }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold text-[#5f523f]">
      <span className="rounded-full bg-[#f4ebdd] px-2 py-1">{article.year}</span>
      <span className="rounded-full bg-[#f4ebdd] px-2 py-1">{article.platform}</span>
      <span className="rounded-full bg-[#f4ebdd] px-2 py-1">{article.versions} versions</span>
      <span className="rounded-full bg-[#f4ebdd] px-2 py-1">{article.iterationCount} iterations</span>
      {article.articleRating ? (
        <span className="rounded-full bg-[#e8f4f7] px-2 py-1 text-[#0f6179]">
          {formatArticleRating(article)}
        </span>
      ) : null}
      {article.heroImageProvider ? (
        <span className="rounded-full bg-[#f4ebdd] px-2 py-1">
          {formatHeroImageProvider(article)}
        </span>
      ) : null}
    </div>
  );
}

function TreeNode({
  node,
  activeOpenRef,
  collapsed,
  onToggle,
  onContextMenu,
}: {
  node: ArticleWorkspaceTreeNode;
  activeOpenRef: string;
  collapsed: Set<string>;
  onToggle: (openRef: string) => void;
  onContextMenu: (event: React.MouseEvent, target: WorkspaceMenuTarget) => void;
}) {
  const Icon = node.kind === "directory" ? Folder : iconForFile(node.name);
  const active = node.openRef === activeOpenRef;
  const isCollapsed = collapsed.has(node.openRef);

  return (
    <div>
      <div
        onContextMenu={(event) =>
          onContextMenu(event, {
            openRef: node.openRef,
            name: node.name,
            kind: node.kind,
            root: false,
          })
        }
        className={cn(
          "flex min-w-0 items-center gap-1 rounded-[9px] px-1 py-1 text-[#5f523f] hover:bg-white hover:text-[#171717]",
          active ? "bg-white text-[#0f7ea9] shadow-[0_1px_0_rgba(12,17,21,0.04)]" : null
        )}
      >
        {node.kind === "directory" ? (
          <button
            type="button"
            onClick={() => onToggle(node.openRef)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#806f58] hover:bg-[#f4ebdd]"
            aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", !isCollapsed && "rotate-90")} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <Link
          href={`/dashboard/articles?open=${encodeURIComponent(node.openRef)}`}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Icon className={cn("h-3.5 w-3.5 shrink-0", node.kind === "directory" ? "text-[#0f7ea9]" : "text-[#806f58]")} />
          <span className="truncate">{node.name}</span>
        </Link>
      </div>
      {node.children?.length && !isCollapsed ? (
        <div className="ml-3 border-l border-[#eadfce] pl-2">
          {node.children.map((child) => (
            <TreeNode
              key={`${child.section}:${child.relativePath}`}
              node={child}
              activeOpenRef={activeOpenRef}
              collapsed={collapsed}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PreviewHeader({
  preview,
  treeHidden,
  onShowTree,
}: {
  preview: ArticleWorkspacePreview;
  treeHidden: boolean;
  onShowTree: () => void;
}) {
  const displayPath = preview.relativePath || preview.label;
  return (
    <header className="border-b border-[#eadfce] bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {treeHidden ? (
            <button
              type="button"
              onClick={onShowTree}
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8cab5] bg-[#fffaf2] text-[#5f523f]"
              aria-label="Show folder structure"
              title="Show folder structure"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#806f58]">
              {preview.label}
            </p>
            <h2 className="mt-2 truncate font-mono text-lg font-semibold text-[#171717]">
              {displayPath}
            </h2>
            <p className="mt-1 truncate text-xs text-[#806f58]">{preview.root}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#5f523f]">
          <span className="rounded-full bg-[#f4ebdd] px-3 py-1">{preview.kind}</span>
          {preview.language ? <span className="rounded-full bg-[#f4ebdd] px-3 py-1">{preview.language}</span> : null}
          {preview.size ? <span className="rounded-full bg-[#f4ebdd] px-3 py-1">{formatBytes(preview.size)}</span> : null}
        </div>
      </div>
    </header>
  );
}

function PreviewBody({
  preview,
  articles,
  query,
}: {
  preview: ArticleWorkspacePreview;
  articles: ArticleWorkspaceArticleSummary[];
  query: string;
}) {
  if (!preview.exists) {
    return (
      <div className="px-5 py-10 text-sm leading-6 text-[#806f58]">
        Nothing selected yet. Import Medium articles, then click articles → slug → v001 → article.md or artifacts.
      </div>
    );
  }

  if (preview.kind === "directory") {
    if (preview.section === "articles") {
      const selectedArticle = articles.find((article) => article.slug === preview.relativePath);
      if (!preview.relativePath || selectedArticle) {
        return <ArticleDirectoryPreview preview={preview} articles={articles} selectedArticle={selectedArticle} query={query} />;
      }
    }

    return (
      <div className="p-5">
        <DirectoryContents preview={preview} />
      </div>
    );
  }

  const mimeType = preview.mimeType ?? "application/octet-stream";
  if (mimeType.startsWith("image/")) {
    return (
      <div className="p-5">
        <div className="overflow-hidden rounded-[18px] border border-[#eadfce] bg-white p-3">
          <img
            src={`/api/article/fs/blob?open=${encodeURIComponent(preview.openRef)}`}
            alt={preview.relativePath}
            className="h-auto max-h-[620px] w-full object-contain"
          />
        </div>
      </div>
    );
  }

  if (preview.text != null) {
    const contextualArticle = findArticleForPreview(preview, articles);
    return (
      <div>
        {contextualArticle ? <ArticleFileQualityPanel article={contextualArticle} /> : null}
        <ArticleWorkspaceTextPanel
          openRef={preview.openRef}
          section={preview.section}
          relativePath={preview.relativePath}
          language={preview.language}
          text={preview.text}
          truncated={preview.truncated}
        />
      </div>
    );
  }

  return (
    <div className="px-5 py-10 text-sm leading-6 text-[#806f58]">
      Binary artifact. Open path locally: <span className="font-mono text-[#3d3328]">{preview.absolutePath}</span>
    </div>
  );
}

function ArticleFileQualityPanel({ article }: { article: ArticleWorkspaceArticleSummary }) {
  return (
    <div className="border-b border-[#eadfce] bg-[#fffaf2] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#806f58]">Medium automation pipeline</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {article.articleRating ? (
              <span className="rounded-full bg-[#e8f4f7] px-3 py-1 text-xs font-semibold text-[#0f6179]">
                {formatArticleRating(article)}
              </span>
            ) : (
              <span className="rounded-full bg-[#f4ebdd] px-3 py-1 text-xs font-semibold text-[#806f58]">
                No rating yet
              </span>
            )}
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#5f523f]">
              {article.iterationCount} iteration{article.iterationCount === 1 ? "" : "s"}
            </span>
            {article.heroImageProvider ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#5f523f]">
                {formatHeroImageProvider(article)}
              </span>
            ) : null}
          </div>
          {article.feedbackSummary ? (
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#3d3328]">{article.feedbackSummary}</p>
          ) : null}
          {article.improvementSummary ? (
            <p className="mt-1 max-w-4xl text-xs leading-5 text-[#6f4d2c]">
              <span className="font-semibold">Next improvement:</span> {article.improvementSummary}
            </p>
          ) : null}
          {article.pros?.length || article.cons?.length ? (
            <div className="mt-3 grid max-w-4xl gap-3 text-xs leading-5 text-[#3d3328] md:grid-cols-2">
              {article.pros?.length ? (
                <div>
                  <p className="font-semibold text-[#0f6179]">Pros</p>
                  <ul className="mt-1 space-y-1">
                    {article.pros.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {article.cons?.length ? (
                <div>
                  <p className="font-semibold text-[#8a4b15]">Cons</p>
                  <ul className="mt-1 space-y-1">
                    {article.cons.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <Link
          className="shrink-0 rounded-full bg-[#171717] px-3 py-1.5 text-xs font-semibold text-white"
          href={`/dashboard/articles?open=${encodeURIComponent(article.folderOpenRef)}`}
        >
          Open pipeline memory
        </Link>
      </div>
    </div>
  );
}

function ArticleDirectoryPreview({
  preview,
  articles,
  selectedArticle,
  query,
}: {
  preview: ArticleWorkspacePreview;
  articles: ArticleWorkspaceArticleSummary[];
  selectedArticle?: ArticleWorkspaceArticleSummary;
  query: string;
}) {
  const visibleArticles = selectedArticle ? articles : filterArticles(articles, query);

  return (
    <div className="space-y-5 p-5">
      <div className="rounded-[20px] border border-[#eadfce] bg-white p-4">
        {selectedArticle ? (
          <ArticleHeroSummary article={selectedArticle} />
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#806f58]">Article memory</p>
            <h3 className="mt-2 text-2xl font-semibold text-[#171717]">Articles</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f523f]">
              Finished Notion/Medium references and generated versions live here as folders. Each folder keeps v001...v999 plus artifacts/images, sources, and evals so future agents can inspect how article thinking evolved.
            </p>
          </>
        )}
      </div>

      {selectedArticle ? null : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visibleArticles.map((article) => (
            <Link
              key={article.slug}
              href={`/dashboard/articles?open=${encodeURIComponent(article.folderOpenRef)}`}
              className="overflow-hidden rounded-[18px] border border-[#eadfce] bg-white text-[#171717] hover:border-[#c6b292] hover:bg-[#fffaf2]"
            >
              {article.heroImageUrl ? (
                <img
                  src={article.heroImageUrl}
                  alt=""
                  className="aspect-[16/9] w-full border-b border-[#eadfce] object-cover"
                />
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center border-b border-[#eadfce] bg-[#f4ebdd] text-[#806f58]">
                  <ImageIcon className="h-7 w-7" />
                </div>
              )}
              <div className="p-4">
                <h4 className="line-clamp-2 text-base font-semibold leading-6">{article.title}</h4>
                {article.subtitle ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5f523f]">{article.subtitle}</p> : null}
                <ArticleMeta article={article} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <DirectoryContents preview={preview} />
    </div>
  );
}

function ArticleHeroSummary({ article }: { article: ArticleWorkspaceArticleSummary }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {article.heroImageUrl ? (
        <img
          src={article.heroImageUrl}
          alt=""
          className="aspect-[16/9] w-full rounded-[16px] border border-[#eadfce] object-cover"
        />
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center rounded-[16px] border border-[#eadfce] bg-[#f4ebdd] text-[#806f58]">
          <ImageIcon className="h-7 w-7" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#806f58]">Article folder</p>
        <h3 className="mt-2 text-2xl font-semibold leading-tight text-[#171717]">{article.title}</h3>
        {article.subtitle ? <p className="mt-3 text-sm leading-6 text-[#5f523f]">{article.subtitle}</p> : null}
        <ArticleMeta article={article} />
        <ArticleQualityOverview article={article} />
        <ArticleEvolutionDetails article={article} />
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {article.notionUrl ? (
            <a className="rounded-full bg-[#f4ebdd] px-3 py-1 text-[#3d3328] hover:bg-[#eadfce]" href={article.notionUrl} target="_blank" rel="noreferrer">
              Notion source
            </a>
          ) : null}
          {article.mediumUrl ? (
            <a className="rounded-full bg-[#f4ebdd] px-3 py-1 text-[#3d3328] hover:bg-[#eadfce]" href={article.mediumUrl} target="_blank" rel="noreferrer">
              Medium
            </a>
          ) : null}
          <Link className="rounded-full bg-[#171717] px-3 py-1 text-white" href={`/dashboard/articles?open=${encodeURIComponent(article.openRef)}`}>
            Open latest draft
          </Link>
        </div>
      </div>
    </div>
  );
}

function ArticleQualityOverview({ article }: { article: ArticleWorkspaceArticleSummary }) {
  const items = [
    article.articleRating ? { label: "Rating", value: formatArticleRating(article) } : null,
    { label: "Iterations", value: String(article.iterationCount) },
    article.evidenceCount ? { label: "Evidence", value: String(article.evidenceCount) } : null,
    article.wordCount ? { label: "Words", value: article.wordCount.toLocaleString() } : null,
    article.totalCost ? { label: "Run cost", value: `$${article.totalCost.toFixed(3)}` } : null,
    article.totalTokens ? { label: "Tokens", value: article.totalTokens.toLocaleString() } : null,
    article.heroImageProvider ? { label: "Hero image", value: formatHeroImageProvider(article) } : null,
    article.heroImageStatus ? { label: "Image status", value: article.heroImageStatus } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  if (!items.length) return null;

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-[12px] border border-[#eadfce] bg-[#fffaf2] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#806f58]">{item.label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#171717]" title={item.value}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ArticleEvolutionDetails({ article }: { article: ArticleWorkspaceArticleSummary }) {
  const hasFeedback = article.feedbackSummary || article.biggestProblem || article.improvementSummary || article.sourceSummary;
  const scoreRows = article.evaluatorScores?.slice(-6) ?? [];
  const phases = article.phaseLog?.slice(-8) ?? [];
  if (!hasFeedback && !scoreRows.length && !phases.length) return null;

  return (
    <div className="mt-4 space-y-3 rounded-[16px] border border-[#eadfce] bg-[#fffaf2] p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#806f58]">Rating feedback / evolution memory</p>
        {article.feedbackSummary ? <p className="mt-2 text-sm leading-6 text-[#3d3328]">{article.feedbackSummary}</p> : null}
        {article.biggestProblem ? (
          <p className="mt-2 text-xs leading-5 text-[#7b392f]"><span className="font-semibold">Biggest problem:</span> {article.biggestProblem}</p>
        ) : null}
        {article.improvementSummary ? (
          <p className="mt-1 text-xs leading-5 text-[#5f523f]"><span className="font-semibold">Next improvement:</span> {article.improvementSummary}</p>
        ) : null}
        {article.sourceSummary ? (
          <p className="mt-1 text-xs leading-5 text-[#5f523f]"><span className="font-semibold">Sources:</span> {article.sourceSummary}</p>
        ) : null}
      </div>
      {scoreRows.length ? (
        <div className="flex flex-wrap gap-1.5">
          {scoreRows.map((score, index) => (
            <span key={`${score.label}-${score.score}-${index}`} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#0f6179]">
              {score.label}: {score.score}/{score.maxScore ?? 10}
            </span>
          ))}
        </div>
      ) : null}
      {phases.length ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {phases.map((phase, index) => (
            <div key={`${phase.name}-${index}`} className="rounded-[10px] bg-white px-2 py-1.5 text-[11px] leading-4 text-[#5f523f]">
              <span className="font-semibold text-[#171717]">{phase.name}</span>
              {phase.rating ? <span> · {phase.rating}/10</span> : null}
              {phase.model ? <span> · {phase.model}</span> : null}
              {phase.notes ? <span> · {phase.notes}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DirectoryContents({ preview }: { preview: ArticleWorkspacePreview }) {
  return (
    <div className="rounded-[18px] border border-[#eadfce] bg-white">
      <div className="border-b border-[#eadfce] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#806f58]">
        Directory Contents
      </div>
      <div className="divide-y divide-[#f1e8db]">
        {preview.children?.length ? (
          preview.children.map((child) => {
            const Icon = child.kind === "directory" ? Folder : iconForFile(child.name);
            return (
              <Link
                key={`${child.section}:${child.relativePath}`}
                href={`/dashboard/articles?open=${encodeURIComponent(child.openRef)}`}
                className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-sm text-[#3d3328] hover:bg-[#fffaf2]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-[#0f7ea9]" />
                  <span className="truncate">{child.name}</span>
                </span>
                <span className="shrink-0 text-xs text-[#806f58]">{child.kind}</span>
              </Link>
            );
          })
        ) : (
          <p className="px-4 py-8 text-sm text-[#806f58]">Empty directory.</p>
        )}
      </div>
    </div>
  );
}

function ContextMenu({
  menu,
  onAction,
}: {
  menu: WorkspaceMenu;
  onAction: (action: "edit" | "new-file" | "new-folder" | "rename" | "delete") => void;
}) {
  const canCreate = menu.target.kind === "directory";
  const canMutate = !menu.target.root;

  return (
    <div
      className="fixed z-[80] min-w-44 overflow-hidden rounded-[14px] border border-[#d8cab5] bg-white py-1 text-sm text-[#3d3328] shadow-[0_18px_42px_rgba(23,23,23,0.16)]"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {menu.target.kind === "file" ? (
        <MenuButton icon={Pencil} label="Edit" onClick={() => onAction("edit")} />
      ) : null}
      {canCreate ? (
        <>
          <MenuButton icon={FilePlus2} label="New file" onClick={() => onAction("new-file")} />
          <MenuButton icon={FolderPlus} label="New folder" onClick={() => onAction("new-folder")} />
        </>
      ) : null}
      {canMutate ? (
        <>
          <div className="my-1 h-px bg-[#eadfce]" />
          <MenuButton icon={Pencil} label="Rename" onClick={() => onAction("rename")} />
          <MenuButton icon={Trash2} label="Delete" danger onClick={() => onAction("delete")} />
        </>
      ) : null}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#fffaf2]",
        danger ? "text-[#9c3b2f]" : "text-[#3d3328]"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}



async function persistKanban(columns: ArticleWorkspaceKanbanColumn[], articles: ArticleWorkspaceArticleSummary[]) {
  const assignments = Object.fromEntries(articles.map((article) => [article.slug, article.status]));
  const order: Record<string, string[]> = Object.fromEntries(columns.map((column) => [column.id, []]));
  for (const article of articles) {
    order[article.status] = order[article.status] ?? [];
    order[article.status].push(article.slug);
  }

  const response = await fetch("/api/article/kanban", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columns, assignments, order }),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok || result.error) window.alert(result.error || "Kanban update failed.");
}

function makeClientColumnId(label: string, existingIds: string[]) {
  const base = label
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

function appendSearchText(searchText: string, value: string) {
  return `${searchText} ${value}`.trim().toLowerCase();
}

function formatHeroImageProvider(article: ArticleWorkspaceArticleSummary) {
  const provider = article.heroImageProvider === "gemini" ? "Gemini" : article.heroImageProvider;
  return [provider, article.heroImageModel].filter(Boolean).join(" ");
}

function formatArticleRating(article: ArticleWorkspaceArticleSummary) {
  return [formatRatingNumber(article.articleRating), article.articleRatingModel].filter(Boolean).join(" · ");
}

function formatRatingNumber(value: number | undefined) {
  if (value === undefined) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function findArticleForPreview(preview: ArticleWorkspacePreview, articles: ArticleWorkspaceArticleSummary[]) {
  if (preview.section !== "articles" || !preview.relativePath) return undefined;
  const [slug] = preview.relativePath.split("/");
  if (!slug) return undefined;
  return articles.find((article) => article.slug === slug);
}

function filterArticles(articles: ArticleWorkspaceArticleSummary[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return articles;
  return articles.filter((article) => terms.every((term) => article.searchText.includes(term)));
}

function filterWorkspaceTrees(trees: ArticleWorkspaceSectionTree[], query: string) {
  const totalCount = countWorkspaceTreeItems(trees);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { trees, totalCount, visibleCount: totalCount };

  const filteredTrees = trees
    .map((tree) => filterWorkspaceSectionTree(tree, terms))
    .filter((tree): tree is ArticleWorkspaceSectionTree => Boolean(tree));

  return {
    trees: filteredTrees,
    totalCount,
    visibleCount: countWorkspaceTreeItems(filteredTrees),
  };
}

function filterWorkspaceSectionTree(
  tree: ArticleWorkspaceSectionTree,
  terms: string[]
): ArticleWorkspaceSectionTree | null {
  if (matchesWorkspaceTerms([tree.label, tree.section, tree.root], terms)) return tree;

  const children = tree.children
    .map((node) => filterWorkspaceTreeNode(node, terms))
    .filter((node): node is ArticleWorkspaceTreeNode => Boolean(node));

  if (!children.length) return null;
  return { ...tree, children };
}

function filterWorkspaceTreeNode(node: ArticleWorkspaceTreeNode, terms: string[]): ArticleWorkspaceTreeNode | null {
  if (matchesWorkspaceTerms([node.name, node.relativePath, node.openRef, node.kind], terms)) return node;

  const children = node.children
    ?.map((child) => filterWorkspaceTreeNode(child, terms))
    .filter((child): child is ArticleWorkspaceTreeNode => Boolean(child));

  if (!children?.length) return null;
  return { ...node, children };
}

function matchesWorkspaceTerms(values: string[], terms: string[]) {
  const haystack = values.join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function countWorkspaceTreeItems(trees: ArticleWorkspaceSectionTree[]) {
  return trees.reduce((total, tree) => total + 1 + tree.children.reduce((sum, child) => sum + countWorkspaceTreeNode(child), 0), 0);
}

function countWorkspaceTreeNode(node: ArticleWorkspaceTreeNode): number {
  return 1 + (node.children?.reduce((total, child) => total + countWorkspaceTreeNode(child), 0) ?? 0);
}

function collectDirectoryRefs(trees: ArticleWorkspaceSectionTree[]) {
  const refs = new Set<string>();
  for (const tree of trees) {
    refs.add(`${tree.section}:`);
    for (const child of tree.children) collectDirectoryRefsFromNode(child, refs);
  }
  return refs;
}

function collectDirectoryRefsFromNode(node: ArticleWorkspaceTreeNode, refs: Set<string>) {
  if (node.kind !== "directory") return;
  refs.add(node.openRef);
  for (const child of node.children ?? []) collectDirectoryRefsFromNode(child, refs);
}

function readStoredOpenRefSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeStoredOpenRefSet(key: string, value: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    // Ignore storage failures so private browsing or quota issues do not break navigation.
  }
}

function iconForFile(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension ?? "")) return ImageIcon;
  if (["json", "jsonl", "yaml", "yml"].includes(extension ?? "")) return FileJson;
  if (["md", "mdx", "txt", "html"].includes(extension ?? "")) return FileText;
  return File;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
