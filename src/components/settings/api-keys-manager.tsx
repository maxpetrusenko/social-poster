"use client";

import { useState, useMemo } from "react";

type ApiKey = {
  id: string;
  workspaceId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  keySuffix: string;
  scope: string;
  permission: string;
  status: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy: string;
  createdAt: Date;
};

export function ApiKeysManager({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [permFilter, setPermFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState("all");
  const [newPerm, setNewPerm] = useState("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    return keys.filter((k) => {
      if (search && !k.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && k.status !== statusFilter) return false;
      if (permFilter !== "all" && k.permission !== permFilter) return false;
      return true;
    });
  }, [keys, search, statusFilter, permFilter]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, scope: newScope, permission: newPerm }),
    });
    const data = await res.json();
    if (res.ok) {
      setCreatedKey(data.key);
      setKeys((prev) => [
        { id: data.id, workspaceId: "", name: data.name, keyHash: "", keyPrefix: data.key.slice(0, 10), keySuffix: data.key.slice(-6), scope: data.scope, permission: data.permission, status: "active", lastUsedAt: null, revokedAt: null, createdBy: "", createdAt: new Date() },
        ...prev,
      ]);
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: "revoked", revokedAt: new Date() } : k));
  }

  function closeModal() {
    setShowCreate(false);
    setCreatedKey(null);
    setNewName("");
    setNewScope("all");
    setNewPerm("read");
    setCopied(false);
  }

  function copyKey() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function formatDate(d: Date | null) {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#171717]">App Access</h1>
          <p className="text-sm text-[#171717]/60 mt-1">Keys for external clients that call the ClawPoster API</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-[#171717] text-white rounded-lg text-sm font-medium hover:bg-[#171717]/90 transition-colors">
          + Create key
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search keys..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 px-3 py-2 border border-[#e5d9c8] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#171717]/10" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-[#e5d9c8] rounded-lg text-sm bg-white">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
        <select value={permFilter} onChange={(e) => setPermFilter(e.target.value)} className="px-3 py-2 border border-[#e5d9c8] rounded-lg text-sm bg-white">
          <option value="all">All permissions</option>
          <option value="read">Read</option>
          <option value="read_write">Read &amp; Write</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#e5d9c8] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5d9c8] text-left text-[#171717]/60">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Permission</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#171717]/40">No API keys found</td></tr>
            )}
            {filtered.map((k) => (
              <tr key={k.id} className="border-b border-[#e5d9c8] last:border-0 hover:bg-[#f5f0e6]/50 group">
                <td className="px-4 py-3">
                  <div className="font-medium text-[#171717]">{k.name}</div>
                  <div className="text-xs text-[#171717]/50">{formatDate(k.createdAt)}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#171717]/70">{k.keyPrefix}...{k.keySuffix}</td>
                <td className="px-4 py-3 text-[#171717]/70 capitalize">{k.scope === "all" ? "All profiles" : k.scope}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${k.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {k.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium border border-[#e5d9c8] text-[#171717]/70">
                    {k.permission === "read_write" ? "Read & Write" : "Read"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {k.status === "active" && (
                    <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-600 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-xl border border-[#e5d9c8] p-6 w-full max-w-md shadow-xl">
            {!createdKey ? (
              <>
                <h2 className="text-lg font-semibold text-[#171717] mb-4">Create App Key</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#171717]/70 mb-1">Name</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Production API" className="w-full px-3 py-2 border border-[#e5d9c8] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/10" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#171717]/70 mb-1">Scope</label>
                    <select value={newScope} onChange={(e) => setNewScope(e.target.value)} className="w-full px-3 py-2 border border-[#e5d9c8] rounded-lg text-sm bg-white">
                      <option value="all">All profiles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#171717]/70 mb-1">Permission</label>
                    <select value={newPerm} onChange={(e) => setNewPerm(e.target.value)} className="w-full px-3 py-2 border border-[#e5d9c8] rounded-lg text-sm bg-white">
                      <option value="read">Read</option>
                      <option value="read_write">Read &amp; Write</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={closeModal} className="px-4 py-2 text-sm text-[#171717]/70 hover:text-[#171717] transition-colors">Cancel</button>
                  <button onClick={handleCreate} disabled={creating || !newName.trim()} className="px-4 py-2 bg-[#171717] text-white rounded-lg text-sm font-medium hover:bg-[#171717]/90 disabled:opacity-50 transition-colors">
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-[#171717] mb-4">Key Created</h2>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-amber-800 font-medium">Save this key — it won&apos;t be shown again</p>
                </div>
                <div className="flex items-center gap-2 bg-[#f5f0e6] rounded-lg p-3">
                  <code className="flex-1 text-xs font-mono break-all text-[#171717]">{createdKey}</code>
                  <button onClick={copyKey} className="shrink-0 px-3 py-1.5 bg-[#171717] text-white rounded text-xs font-medium hover:bg-[#171717]/90 transition-colors">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="flex justify-end mt-6">
                  <button onClick={closeModal} className="px-4 py-2 bg-[#171717] text-white rounded-lg text-sm font-medium hover:bg-[#171717]/90 transition-colors">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
