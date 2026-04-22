"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { ContextMenu, type ContextMenuState } from "./profile-workspace-context-menu";
import {
  DEFAULT_ACTIVE_PATH,
  CAMPAIGNS_PATH,
  PROTECTED_PATHS,
  ROOT_PATH,
  basename,
  childPath,
  cloneSubtree,
  defaultFileContent,
  defaultCampaignContent,
  deleteSubtree,
  isDescendant,
  moveSubtree,
  normalizeWorkspace,
  parentOf,
  sanitizeName,
  serializeWorkspace,
  uniquePath,
  type Profile,
  type ProfileConfig,
  type WorkspaceTree,
} from "./profile-workspace-config";
import { Editor } from "./profile-workspace-editor";
import { Explorer } from "./profile-workspace-explorer";

type ClipboardState = {
  sourcePath: string;
  tree: WorkspaceTree;
};

export function ProfileWorkspace({ initialProfile }: { initialProfile: Profile }) {
  const router = useRouter();
  const initialWorkspace = normalizeWorkspace(initialProfile);
  const [profile, setProfile] = useState(initialProfile);
  const [tree, setTree] = useState<WorkspaceTree>(initialWorkspace.tree);
  const [activePath, setActivePath] = useState(initialWorkspace.activePath);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    [ROOT_PATH]: true,
    assets: true,
    skills: true,
    knowledgebase: true,
    platforms: true,
    [CAMPAIGNS_PATH]: true,
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeNode = tree[activePath] ?? tree[DEFAULT_ACTIVE_PATH];
  const activeIsFolder = activeNode?.type === "folder";
  const activeContent =
    activeNode?.type === "file"
      ? activeNode.content ?? defaultFileContent(profile, activePath)
      : "";

  const markDirty = useCallback(() => {
    setSaved(false);
    setError(null);
  }, []);

  function selectPath(path: string) {
    if (tree[path]) setActivePath(path);
  }

  function toggleFolder(path: string) {
    const node = path === ROOT_PATH ? { type: "folder" } : tree[path];
    if (!node || node.type !== "folder") return;
    setOpenFolders((prev) => ({ ...prev, [path]: !(prev[path] ?? false) }));
    setActivePath(path);
  }

  function updateDocument(nextValue: string) {
    if (!activeNode || activeNode.type !== "file") return;
    updatePathDocument(activePath, nextValue);
  }

  function updatePathDocument(path: string, nextValue: string) {
    const node = tree[path];
    if (!node || node.type !== "file") return;
    markDirty();
    setTree((prev) => ({
      ...prev,
      [path]: { ...prev[path], type: "file", content: nextValue },
    }));
  }

  function updateProfileField(
    key: "name" | "bio" | "tone" | "voiceId" | "faceId",
    nextValue: string
  ) {
    markDirty();
    setProfile((prev) => ({ ...prev, [key]: nextValue }));
  }

  function createNode(parentPath: string, type: "file" | "folder") {
    const parent = parentPath === ROOT_PATH ? ROOT_PATH : parentPath;
    const defaultName = type === "file" ? "new-file.md" : "new-folder";
    const input = window.prompt(type === "file" ? "File name" : "Folder name", defaultName);
    if (!input) return;
    const name = sanitizeName(input, defaultName, type === "file");
    const nextPath = uniquePath(tree, childPath(parent, name));
    markDirty();
    setTree((prev) => ({
      ...prev,
      [nextPath]:
        type === "folder"
          ? { type: "folder" }
          : { type: "file", content: defaultFileContent(profile, nextPath) },
    }));
    setOpenFolders((prev) => ({ ...prev, [parent]: true }));
    setActivePath(nextPath);
  }

  function createCampaign(title?: string) {
    const input = title || window.prompt("Campaign name", "New campaign");
    if (!input) return;
    const folderName = sanitizeName(input, "new-campaign", false).toLowerCase();
    const folderPath = uniquePath(tree, childPath(CAMPAIGNS_PATH, folderName));
    const filePath = childPath(folderPath, "campaign.md");
    markDirty();
    setTree((prev) => ({
      ...prev,
      platforms: prev.platforms ?? { type: "folder" },
      [CAMPAIGNS_PATH]: prev[CAMPAIGNS_PATH] ?? { type: "folder", system: true },
      [folderPath]: { type: "folder" },
      [filePath]: { type: "file", content: defaultCampaignContent(profile, input) },
    }));
    setOpenFolders((prev) => ({ ...prev, platforms: true, [CAMPAIGNS_PATH]: true, [folderPath]: true }));
    setActivePath(filePath);
  }

  function renamePath(path: string) {
    const node = tree[path];
    if (!node || PROTECTED_PATHS.has(path)) return;
    const input = window.prompt("Rename", basename(path));
    if (!input) return;
    const name = sanitizeName(input, basename(path), node.type === "file");
    const target = uniquePath(tree, childPath(parentOf(path), name));
    if (target === path) return;
    markDirty();
    setTree((prev) => moveSubtree(prev, path, target));
    setOpenFolders((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(prev)) {
        if (key === path || isDescendant(key, path)) {
          const suffix = key === path ? "" : key.slice(path.length);
          delete next[key];
          next[`${target}${suffix}`] = value;
        }
      }
      return next;
    });
    setActivePath((prev) => {
      if (prev === path) return target;
      if (isDescendant(prev, path)) return `${target}${prev.slice(path.length)}`;
      return prev;
    });
  }

  function deletePath(path: string) {
    const node = tree[path];
    if (!node || PROTECTED_PATHS.has(path)) return;
    const confirmed = window.confirm(`Delete ${basename(path)}${node.type === "folder" ? " and its contents" : ""}?`);
    if (!confirmed) return;
    markDirty();
    setTree((prev) => deleteSubtree(prev, path));
    setActivePath((prev) => {
      if (prev === path || isDescendant(prev, path)) return parentOf(path) || DEFAULT_ACTIVE_PATH;
      return prev;
    });
  }

  const copyPath = useCallback((path: string) => {
    if (!tree[path]) return;
    setClipboard({ sourcePath: path, tree });
  }, [tree]);

  const pasteInto = useCallback((parentPath: string) => {
    if (!clipboard) return;
    const parent = parentPath === ROOT_PATH ? ROOT_PATH : parentPath;
    const sourceName = basename(clipboard.sourcePath);
    const target = uniquePath(tree, childPath(parent, sourceName));
    const cloned = cloneSubtree(clipboard.tree, clipboard.sourcePath, target);
    if (Object.keys(cloned).length === 0) return;
    markDirty();
    setTree((prev) => ({ ...prev, ...cloned }));
    setOpenFolders((prev) => ({ ...prev, [parent]: true }));
    setActivePath(target);
  }, [clipboard, markDirty, tree]);

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
    }

    function handleKeyboard(event: KeyboardEvent) {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === "textarea" || tag === "input") return;
      if (event.key.toLowerCase() === "c" && activePath) {
        event.preventDefault();
        copyPath(activePath);
      }
      if (event.key.toLowerCase() === "v" && clipboard) {
        event.preventDefault();
        const targetParent = tree[activePath]?.type === "folder" ? activePath : parentOf(activePath);
        pasteInto(targetParent);
      }
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [activePath, clipboard, copyPath, pasteInto, tree]);

  function openContextMenu(event: React.MouseEvent, path: string) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, path });
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const nextConfig: ProfileConfig = {
        ...(profile.config ?? {}),
        profileWorkspace: serializeWorkspace(tree, activePath),
      };
      const response = await fetch(`/api/profiles/${profile.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, config: nextConfig }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to save profile workspace");
      }
      const updated = (await response.json()) as Profile;
      const normalized = normalizeWorkspace(updated);
      setProfile(updated);
      setTree(normalized.tree);
      setActivePath(normalized.activePath);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile workspace");
    } finally {
      setSaving(false);
    }
  }

  const contextNode = contextMenu?.path ? tree[contextMenu.path] : { type: "folder" as const };
  const contextPath = contextMenu?.path ?? ROOT_PATH;

  return (
    <div className="min-h-screen bg-[#f7f7f7] text-[#171717]">
      <div className="border-b border-[#dedede] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard/profiles"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#d6d6d6] bg-white text-[#333] transition hover:bg-[#f2f2f2]"
              aria-label="Back to profiles"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#666]">
                Profile Workspace
              </p>
              <h1 className="truncate text-3xl font-semibold leading-none text-[#171717]">
                {profile.name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saved ? (
              <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#cfd8cf] bg-[#f0f7f0] px-3 py-2 text-xs font-semibold text-[#286028]">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            ) : null}
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#171717] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving" : "Save workspace"}
            </button>
          </div>
        </div>
        {error ? (
          <div className="mt-3 rounded-[8px] border border-[#efb8a8] bg-[#fff0eb] px-3 py-2 text-sm font-medium text-[#9c321f]">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Explorer
          profileName={profile.name}
          tree={tree}
          activePath={activePath}
          openFolders={openFolders}
          onSelect={selectPath}
          onToggle={toggleFolder}
          onContext={openContextMenu}
        />
        <Editor
          profile={profile}
          tree={tree}
          activePath={activePath}
          activeContent={activeContent}
          activeIsFolder={activeIsFolder}
          onChange={updateDocument}
          onChangePath={updatePathDocument}
          onCreate={createNode}
          onCreateCampaign={createCampaign}
          onProfileFieldChange={updateProfileField}
        />
      </div>

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          node={contextNode}
          canPaste={Boolean(clipboard)}
          onCreateFile={() => {
            createNode(contextPath, "file");
            setContextMenu(null);
          }}
          onCreateFolder={() => {
            createNode(contextPath, "folder");
            setContextMenu(null);
          }}
          onRename={() => {
            renamePath(contextPath);
            setContextMenu(null);
          }}
          onDelete={() => {
            deletePath(contextPath);
            setContextMenu(null);
          }}
          onCopy={() => {
            copyPath(contextPath);
            setContextMenu(null);
          }}
          onPaste={() => {
            pasteInto(contextPath);
            setContextMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}
