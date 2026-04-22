import { Copy, Folder, Pencil, Plus, Trash2 } from "lucide-react";

export type ContextMenuState = {
  x: number;
  y: number;
  path: string;
};

export function ContextMenu({
  state,
  node,
  canPaste,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onCopy,
  onPaste,
}: {
  state: ContextMenuState;
  node: { type: "file" | "folder" } | undefined;
  canPaste: boolean;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
}) {
  const isFolder = !node || node.type === "folder";
  return (
    <div
      className="fixed z-50 w-52 rounded-[8px] border border-[#d6d6d6] bg-white p-1 text-sm shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
      style={{ left: state.x, top: state.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {isFolder ? (
        <>
          <MenuButton icon={Plus} label="New File" onClick={onCreateFile} />
          <MenuButton icon={Folder} label="New Folder" onClick={onCreateFolder} />
          <MenuDivider />
        </>
      ) : null}
      {state.path ? <MenuButton icon={Copy} label="Copy" onClick={onCopy} /> : null}
      {isFolder ? <MenuButton icon={Copy} label="Paste" onClick={onPaste} disabled={!canPaste} /> : null}
      {state.path ? (
        <>
          <MenuDivider />
          <MenuButton icon={Pencil} label="Rename" onClick={onRename} />
          <MenuButton icon={Trash2} label="Delete" onClick={onDelete} danger />
        </>
      ) : null}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "text-[#a12818] hover:bg-[#fff1ee]" : "text-[#222] hover:bg-[#f1f1f1]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-[#ececec]" />;
}
