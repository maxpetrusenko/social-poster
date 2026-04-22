import { FileText, Folder, Plus } from "lucide-react";
import { CampaignEditor } from "./profile-campaign-editor";
import { MarkdownEditor } from "./profile-markdown-editor";
import {
  basename,
  CAMPAIGNS_PATH,
  childPath,
  isCampaignFolder,
  isCampaignPath,
  listChildren,
  type Profile,
  type TreeEntry,
  type WorkspaceTree,
} from "./profile-workspace-config";

export function Editor({
  profile,
  tree,
  activePath,
  activeContent,
  activeIsFolder,
  onChange,
  onChangePath,
  onCreate,
  onCreateCampaign,
  onProfileFieldChange,
}: {
  profile: Profile;
  tree: WorkspaceTree;
  activePath: string;
  activeContent: string;
  activeIsFolder: boolean;
  onChange: (value: string) => void;
  onChangePath: (path: string, value: string) => void;
  onCreate: (parentPath: string, type: "file" | "folder") => void;
  onCreateCampaign: (title?: string) => void;
  onProfileFieldChange: (
    key: "name" | "bio" | "tone" | "voiceId" | "faceId",
    value: string
  ) => void;
}) {
  const folderChildren = activeIsFolder ? listChildren(tree, activePath) : [];
  const campaignFilePath = isCampaignFolder(activePath, tree)
    ? childPath(activePath, "campaign.md")
    : activePath;
  const campaignNode = tree[campaignFilePath];
  const campaignContent =
    campaignNode?.type === "file" ? campaignNode.content ?? "" : activeContent;
  const showCampaign = isCampaignPath(campaignFilePath);
  return (
    <main className="min-w-0 bg-[#f7f7f7]">
      <div className="border-b border-[#dedede] bg-white px-5 py-3">
        <p className="font-mono text-xs text-[#666]">
          Profiles / {profile.name}{activePath ? ` / ${activePath}` : ""}
        </p>
        <p className="mt-1 text-sm text-[#555]">
          {activeIsFolder ? "Folder view" : "Inline markdown editor"}
        </p>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 p-5">
          {showCampaign ? (
            <CampaignEditor
              profile={profile}
              value={campaignContent}
              onChange={(value) => onChangePath(campaignFilePath, value)}
            />
          ) : activeIsFolder ? (
            <FolderView
              path={activePath}
              childrenEntries={folderChildren}
              onCreate={onCreate}
              onCreateCampaign={onCreateCampaign}
            />
          ) : (
            <MarkdownEditor value={activeContent} onChange={onChange} />
          )}
        </section>

        <ProfileSettings profile={profile} onProfileFieldChange={onProfileFieldChange} />
      </div>
    </main>
  );
}

function FolderView({
  path,
  childrenEntries,
  onCreate,
  onCreateCampaign,
}: {
  path: string;
  childrenEntries: TreeEntry[];
  onCreate: (parentPath: string, type: "file" | "folder") => void;
  onCreateCampaign: (title?: string) => void;
}) {
  const isCampaignsRoot = path === CAMPAIGNS_PATH;
  return (
    <div className="rounded-[8px] border border-[#d6d6d6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-[#171717]">{path ? basename(path) : "Profile root"}</p>
          <p className="mt-1 text-sm text-[#666]">{childrenEntries.length} items</p>
        </div>
        <div className="flex gap-2">
          {isCampaignsRoot ? <CreateButton label="Campaign" onClick={() => onCreateCampaign()} /> : null}
          <CreateButton label="File" onClick={() => onCreate(path, "file")} />
          <CreateButton label="Folder" onClick={() => onCreate(path, "folder")} />
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {childrenEntries.map((entry) => (
          <div key={entry.path} className="rounded-[8px] border border-[#e2e2e2] bg-[#fafafa] px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#171717]">
              {entry.node.type === "folder" ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              <span className="truncate">{entry.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSettings({
  profile,
  onProfileFieldChange,
}: {
  profile: Profile;
  onProfileFieldChange: (
    key: "name" | "bio" | "tone" | "voiceId" | "faceId",
    value: string
  ) => void;
}) {
  return (
    <aside className="border-t border-[#dedede] bg-white p-5 xl:border-l xl:border-t-0">
      <div className="space-y-5">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#666]">
            Profile Settings
          </p>
          <div className="mt-3 space-y-3">
            <LabeledInput label="Name" value={profile.name} onChange={(value) => onProfileFieldChange("name", value)} />
            <LabeledInput label="Tone" value={profile.tone ?? ""} onChange={(value) => onProfileFieldChange("tone", value)} />
            <LabeledInput label="Voice ID" value={profile.voiceId ?? ""} onChange={(value) => onProfileFieldChange("voiceId", value)} mono />
            <LabeledInput label="Face ID" value={profile.faceId ?? ""} onChange={(value) => onProfileFieldChange("faceId", value)} mono />
            <label className="block">
              <span className="text-xs font-semibold text-[#555]">Bio</span>
              <textarea
                value={profile.bio ?? ""}
                onChange={(event) => onProfileFieldChange("bio", event.target.value)}
                rows={4}
                className="mt-1 w-full resize-none rounded-[8px] border border-[#d6d6d6] bg-white px-3 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]"
              />
            </label>
          </div>
        </section>

        <section className="rounded-[8px] border border-[#d6d6d6] bg-[#fafafa] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#666]">
            Resolution Order
          </p>
          <div className="mt-3 space-y-2 text-sm text-[#333]">
            <p>1. Root profile files</p>
            <p>2. Root skills</p>
            <p>3. Root memory</p>
            <p>4. Platform folder override</p>
            <p>5. Selected assets/examples</p>
          </div>
        </section>
      </div>
    </aside>
  );
}

function CreateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-[8px] border border-[#d6d6d6] px-3 py-2 text-sm font-semibold hover:bg-[#f2f2f2]"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[#555]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full rounded-[8px] border border-[#d6d6d6] bg-white px-3 py-2 text-sm text-[#171717] outline-none focus:border-[#171717] ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
