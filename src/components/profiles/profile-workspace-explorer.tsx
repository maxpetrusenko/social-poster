import { ChevronRight, FileText, Folder, MoreHorizontal, TerminalSquare } from "lucide-react";
import {
  ROOT_PATH,
  type TreeEntry,
  type WorkspaceTree,
  displayNameForPath,
  visibleEntries,
} from "./profile-workspace-config";

export function Explorer({
  profileName,
  tree,
  activePath,
  openFolders,
  onSelect,
  onToggle,
  onContext,
}: {
  profileName: string;
  tree: WorkspaceTree;
  activePath: string;
  openFolders: Record<string, boolean>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onContext: (event: React.MouseEvent, path: string) => void;
}) {
  const entries = visibleEntries(tree, openFolders);
  return (
    <aside className="border-b border-[#dedede] bg-white lg:border-b-0 lg:border-r">
      <div
        className="border-b border-[#ececec] px-3 py-3"
        onContextMenu={(event) => onContext(event, ROOT_PATH)}
      >
        <div className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm font-semibold text-[#171717]">
          <TerminalSquare className="h-4 w-4 text-[#171717]" />
          Profiles
        </div>
        <button
          type="button"
          onClick={() => onToggle(ROOT_PATH)}
          onContextMenu={(event) => onContext(event, ROOT_PATH)}
          className="mt-1 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm font-semibold text-[#2c2c2c] hover:bg-[#f2f2f2]"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition ${openFolders[ROOT_PATH] ? "rotate-90" : ""}`} />
          <Folder className="h-4 w-4" />
          <span className="truncate">{profileName}</span>
        </button>
      </div>

      {openFolders[ROOT_PATH] ? (
        <div className="max-h-[calc(100vh-13rem)] overflow-auto px-2 py-2">
          {entries.map((entry) => (
            <ExplorerRow
              key={entry.path}
              entry={entry}
              active={entry.path === activePath}
              open={openFolders[entry.path] ?? false}
              onSelect={onSelect}
              onToggle={onToggle}
              onContext={onContext}
            />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function ExplorerRow({
  entry,
  active,
  open,
  onSelect,
  onToggle,
  onContext,
}: {
  entry: TreeEntry;
  active: boolean;
  open: boolean;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onContext: (event: React.MouseEvent, path: string) => void;
}) {
  const isFolder = entry.node.type === "folder";
  return (
    <div style={{ paddingLeft: entry.depth * 14 }}>
      <button
        type="button"
        onClick={() => isFolder ? onToggle(entry.path) : onSelect(entry.path)}
        onDoubleClick={() => onSelect(entry.path)}
        onContextMenu={(event) => onContext(event, entry.path)}
        className={`group flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-sm transition ${
          active ? "bg-[#171717] text-white" : "text-[#303030] hover:bg-[#efefef]"
        }`}
      >
        {isFolder ? (
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-90" : ""}`} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isFolder ? <Folder className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
        <span className="truncate">{displayNameForPath(entry.path, entry.name)}</span>
        <MoreHorizontal className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60" />
      </button>
    </div>
  );
}
