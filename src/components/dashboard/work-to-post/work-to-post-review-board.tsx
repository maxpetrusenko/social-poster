"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Clock3, FileCheck2, LockKeyhole, MessageSquareText, Send, ShieldAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { workToPostDemoAngles, workToPostDemoCards, workToPostTrace, type DemoColumn, type WorkToPostDemoCard } from "@/lib/work-to-post/ui-fixtures";
import { candidateRevision, idempotencyKey, isRecord, WorkToPostUiError, workToPostFetch, type UiLiveCandidate, type UiLiveTimeline } from "@/lib/work-to-post/ui-live";

const columns: Array<{ id: Exclude<DemoColumn, "rejected">; label: string; description: string; accent: string }> = [
  { id: "review", label: "Review", description: "Evidence and judgment", accent: "#0f7ea9" },
  { id: "scheduled", label: "Scheduled", description: "Local dispatch intent", accent: "#9a6700" },
  { id: "published", label: "Published", description: "Fixture outcome only", accent: "#0f766e" },
];

export function WorkToPostReviewBoard() {
  const [mode, setMode] = useState<"fixture" | "live">("live");
  return <div className="space-y-5"><ModeSwitch mode={mode} onChange={setMode} />{mode === "fixture" ? <FixtureReviewBoard /> : <LiveReviewBoard />}</div>;
}

function ModeSwitch({ mode, onChange }: { mode: "fixture" | "live"; onChange: (value: "fixture" | "live") => void }) {
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Workspace data mode"><button type="button" aria-pressed={mode === "live"} onClick={() => onChange("live")} className="rounded-full border border-[#0f7ea9] bg-[#e8f4f7] px-3 py-2 text-sm font-bold text-[#0b5d7d]">Live workspace</button><button type="button" aria-pressed={mode === "fixture"} onClick={() => onChange("fixture")} className="rounded-full border border-[#b8d4dd] bg-white px-3 py-2 text-sm font-bold text-[#15323d]">Fixture demo</button></div>;
}

function FixtureReviewBoard() {
  const [cards, setCards] = useState(workToPostDemoCards);
  const [selectedId, setSelectedId] = useState(cards[0].id);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [comment, setComment] = useState("");
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0];

  const archived = useMemo(() => cards.filter((card) => card.column === "rejected"), [cards]);

  function updateSelected(updater: (card: WorkToPostDemoCard) => WorkToPostDemoCard) {
    setCards((current) => current.map((card) => (card.id === selected.id ? updater(card) : card)));
  }

  function decide(decision: "deny" | "schedule" | "publish") {
    if (decision !== "deny" && !selected.approved) return;
    updateSelected((card) =>
      decision === "deny"
        ? { ...card, column: "rejected", stage: "Rejected", approved: false, dispatchLabel: undefined }
        : {
            ...card,
            column: decision === "schedule" ? "scheduled" : "published",
            stage: "Approved",
            approved: true,
            dispatchLabel: decision === "schedule" ? "simulated_scheduled" : "simulated_published",
          }
    );
  }

  function addComment() {
    if (!comment.trim()) return;
    updateSelected((card) => ({
      ...card,
      column: "review",
      stage: "Draft review",
      revision: card.revision + 1,
      approved: false,
      dispatchLabel: undefined,
    }));
    setComment("");
  }

  return (
    <div className="space-y-5">
      <div aria-live="polite" className="sr-only">{selected.dispatchLabel ?? (selected.approved ? "Approval current" : "Approval requires review")}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#d8e3e7] bg-[#f3f8f9] px-4 py-3 text-sm text-[#38505a]">
        <span><strong className="text-[#15323d]">Local fixture mode.</strong> Actions change only browser state; no provider, scheduler, reply, or network request runs.</span>
        <label className="inline-flex items-center gap-2 font-semibold text-[#15323d]"><input type="checkbox" checked={archiveOpen} onChange={(event) => setArchiveOpen(event.target.checked)} /> Show rejected archive ({archived.length})</label>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => {
          const columnCards = cards.filter((card) => card.column === column.id);
          return <section key={column.id} className="rounded-[24px] border border-[rgba(12,17,21,0.09)] bg-white/85 p-4 shadow-[0_16px_38px_rgba(12,17,21,0.07)]">
            <div className="mb-4 flex items-start justify-between"><div><h2 className="font-serif text-2xl text-[var(--ink)]">{column.label}</h2><p className="mt-1 text-xs text-[var(--muted)]">{column.description}</p></div><span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: column.accent, background: `${column.accent}14` }}>{columnCards.length}</span></div>
            <div className="space-y-3">{columnCards.map((card) => <CandidateCard key={card.id} card={card} selected={card.id === selected.id} onOpen={() => setSelectedId(card.id)} />)}</div>
          </section>;
        })}
      </div>

      {archiveOpen ? <section aria-label="Rejected archive" className="rounded-[24px] border border-[#ead9d5] bg-[#fff9f7] p-4"><div className="mb-3 flex items-center gap-2"><XCircle className="h-4 w-4 text-[#b5473d]" /><h2 className="font-serif text-xl text-[#52221d]">Rejected archive</h2></div><div className="grid gap-3 md:grid-cols-2">{archived.map((card) => <CandidateCard key={card.id} card={card} selected={card.id === selected.id} onOpen={() => setSelectedId(card.id)} />)}</div></section> : null}

      <CandidateDrawer card={selected} comment={comment} onCommentChange={setComment} onAddComment={addComment} onDecision={decide} />
    </div>
  );
}

function LiveReviewBoard() {
  const [candidates, setCandidates] = useState<UiLiveCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<UiLiveTimeline | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [dispatchLabel, setDispatchLabel] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null;
  const revision = candidateRevision(timeline?.candidate ?? selected);

  useEffect(() => {
    let active = true;
    workToPostFetch<{ candidates?: UiLiveCandidate[] }>("/api/work-to-post/candidates")
      .then((result) => {
        if (!active) return;
        const next = Array.isArray(result.candidates) ? result.candidates.filter((candidate) => candidate && typeof candidate.id === "string") : [];
        setCandidates(next); setSelectedId(next[0]?.id ?? null); setError(null);
      })
      .catch((cause: unknown) => active && setError(messageFor(cause)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected?.id) { setTimeline(null); return; }
    let active = true;
    setTimeline(null);
    setDispatchLabel(null);
    workToPostFetch<UiLiveTimeline>(`/api/work-to-post/candidates/${encodeURIComponent(selected.id)}/timeline`)
      .then((result) => active && setTimeline(result))
      .catch((cause: unknown) => active && setError(messageFor(cause)));
    return () => { active = false; };
  }, [selected?.id]);

  async function mutate(target: UiLiveCandidate | null, url: string, body: unknown, onConfirmed: (result: Record<string, unknown>) => void) {
    const expectedRevision = candidateRevision(target);
    if (!target || !expectedRevision) return;
    setPending(true); setError(null);
    try {
      const result = await workToPostFetch<Record<string, unknown>>(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(), "If-Match-Revision": String(expectedRevision) }, body: JSON.stringify(body) });
      onConfirmed(result);
    } catch (cause) { setError(messageFor(cause)); }
    finally { setPending(false); }
  }

  function addComment() {
    const body = comment.trim();
    if (!selected || !body) return;
    void mutate(selected, `/api/work-to-post/candidates/${encodeURIComponent(selected.id)}/comments`, { body }, (result) => {
      const nextRevision = typeof result.revision === "number" ? result.revision : null;
      if (!nextRevision) { setError("The server confirmed the comment without a revision; refresh before making another decision."); return; }
      setCandidates((current) => current.map((candidate) => candidate.id === selected.id ? { ...candidate, currentRevision: nextRevision, status: "draft_review" } : candidate));
      setTimeline((current) => current ? {
        ...current,
        candidate: { ...current.candidate, currentRevision: nextRevision, status: "draft_review" },
        comments: [...current.comments, { body, revisionNumber: nextRevision }],
        revisions: [...current.revisions, { revisionNumber: nextRevision }],
        release: {
          allowed: false,
          reason: "An exact passing independent review is required.",
          account: current.release?.account ?? null,
          policyVersion: current.release?.policyVersion ?? null,
          approvalExpiresAt: current.release?.approvalExpiresAt ?? null,
          reviewStatus: null,
        },
      } : current);
      setDispatchLabel(null);
      setComment("");
    });
  }

  function deny(target = selected) {
    if (!target) return;
    void mutate(target, `/api/work-to-post/candidates/${encodeURIComponent(target.id)}/feedback`, { type: "deny", reasonCodes: ["reviewer_denied"] }, (result) => {
      const candidate = isRecord(result.candidate) ? result.candidate : null;
      if (!candidate || candidate.id !== target.id || candidate.status !== "rejected" || !Number.isInteger(candidate.currentRevision)) {
        setError("The server confirmed denial without a rejected candidate state.");
        return;
      }
      setCandidates((current) => current.map((entry) => entry.id === target.id ? { ...entry, status: "rejected", currentRevision: Number(candidate.currentRevision) } : entry));
      setTimeline((current) => current ? {
        ...current,
        candidate: { ...current.candidate, status: "rejected", currentRevision: Number(candidate.currentRevision) },
        release: {
          allowed: false,
          reason: "Candidate was rejected.",
          account: current.release?.account ?? null,
          policyVersion: current.release?.policyVersion ?? null,
          approvalExpiresAt: current.release?.approvalExpiresAt ?? null,
          reviewStatus: current.release?.reviewStatus ?? null,
        },
      } : current);
      setDispatchLabel(null);
    });
  }

  function submitDecision(command: { type: "approve_schedule"; scheduledAt: string } | { type: "approve_now" }, target = selected) {
    if (!target) return;
    void mutate(target, `/api/work-to-post/candidates/${encodeURIComponent(target.id)}/decisions`, command, (result) => {
      const dispatch = isRecord(result.dispatch) ? result.dispatch : null;
      if (!dispatch || typeof dispatch.action !== "string") {
        setError("The server confirmed the decision without a dispatch result.");
        return;
      }
      const candidate = isRecord(result.candidate) ? result.candidate : null;
      if (candidate && candidate.id === target.id && typeof candidate.status === "string" && Number.isInteger(candidate.currentRevision)) {
        setCandidates((current) => current.map((entry) => entry.id === target.id ? { ...entry, status: String(candidate.status), currentRevision: Number(candidate.currentRevision) } : entry));
        setTimeline((current) => current ? {
          ...current,
          candidate: { ...current.candidate, status: String(candidate.status), currentRevision: Number(candidate.currentRevision) },
        } : current);
      }
      setDispatchLabel(dispatch.action);
    });
  }

  function handleDrop(column: LiveColumnId) {
    const candidate = candidates.find((entry) => entry.id === draggedId);
    setDraggedId(null);
    if (!candidate) return;
    setSelectedId(candidate.id);
    if (column === "needs_work") {
      setError("Add a comment in the drawer to request an angle or copy change. The server will create a new revision.");
      return;
    }
    if (column === "review") {
      setError(null);
      return;
    }
    if (column === "rejected") {
      deny(candidate);
      return;
    }
    if (column === "scheduled") {
      if (releaseBlocked) {
        setError(`Schedule is blocked: ${releaseReason}`);
        return;
      }
      if (!isExactFutureTimestamp(scheduledAt)) {
        setError("Schedule needs an exact future ISO timestamp with timezone.");
        return;
      }
      submitDecision({ type: "approve_schedule", scheduledAt }, candidate);
    }
  }

  const releaseBlocked = !timeline?.release?.allowed || pending;
  const releaseReason = timeline?.release?.reason ?? "An exact passing independent review is required.";
  const scheduleBlocked = releaseBlocked || !isExactFutureTimestamp(scheduledAt);
  const liveColumns = groupLiveCandidates(candidates);
  return <div className="space-y-5">
    <div className="rounded-[18px] border border-[#d8e3e7] bg-[#f3f8f9] px-4 py-3 text-sm text-[#38505a]"><strong className="text-[#15323d]">Live workspace data is session-authenticated.</strong> Schedule and Post now create guarded work-to-post intents only. They do not create scheduled posts or call X until the real provider lane is connected.</div>
    {error ? <p role="alert" aria-label={error} className="rounded-xl border border-[#edc4bd] bg-[#fff5f2] px-4 py-3 text-sm font-semibold text-[#9d2f20]">{error}</p> : null}
    {loading ? <p className="rounded-xl border border-[#d8e3e7] bg-white p-4 text-sm text-[var(--muted)]">Loading workspace candidates…</p> : null}
    {!loading && candidates.length === 0 ? <p className="rounded-xl border border-[#d8e3e7] bg-white p-4 text-sm text-[var(--muted)]">No candidate records were returned by this workspace.</p> : null}
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <section aria-label="Live work-to-post Kanban" className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {liveColumnDefs.map((column) => {
          const columnCards = liveColumns[column.id] ?? [];
          return <section key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={() => handleDrop(column.id)} className="min-h-64 rounded-[24px] border border-[rgba(12,17,21,0.09)] bg-white/85 p-4 shadow-[0_16px_38px_rgba(12,17,21,0.07)]">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl text-[var(--ink)]">{column.label}</h2><p className="mt-1 text-xs text-[var(--muted)]">{column.description}</p></div><span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: column.accent, background: `${column.accent}14` }}>{columnCards.length}</span></div>
            <div className="space-y-3">{columnCards.map((candidate) => <LiveCandidateCard key={candidate.id} candidate={candidate} selected={candidate.id === selected?.id} onOpen={() => { setSelectedId(candidate.id); setError(null); }} onDragStart={() => setDraggedId(candidate.id)} />)}</div>
            {!columnCards.length ? <p className="rounded-xl border border-dashed border-[#cbdde2] bg-[#f8fbfb] p-3 text-xs text-[var(--muted)]">Drop a card here. Publish remains blocked from drag and drop.</p> : null}
          </section>;
        })}
      </section>
      <section role="dialog" aria-modal="false" aria-labelledby="live-candidate-title" className="rounded-[24px] border border-[#d6e3e7] bg-[#f9fcfc] p-5"><p className="section-eyebrow text-[#0f7ea9]">Review drawer · live workspace</p><h2 id="live-candidate-title" className="mt-2 font-serif text-3xl text-[var(--ink)]">{candidateTitle(selected)}</h2><p className="mt-3 text-sm text-[var(--muted)]">Status: {selected?.status || "unavailable"}. Server-confirmed revision: {revision ?? "unavailable"}.</p>{dispatchLabel ? <p className="mt-3 rounded-full bg-[#dff3ed] px-3 py-1.5 text-xs font-bold text-[#0f766e]">{dispatchLabel}</p> : null}
        <InfoPanel title="Completed work proof">{!selected ? <p className="text-sm text-[var(--muted)]">Select a candidate from the board.</p> : <div className="space-y-3 text-sm"><p className="leading-6 text-[#38505a]">{selected.summary ?? timeline?.completion?.summary ?? "Summary unavailable."}</p><div className="grid gap-2 text-xs text-[#49636c]"><span><strong>Source:</strong> {selected.sourceAgent ?? timeline?.completion?.sourceAgent ?? "unknown"}</span><span><strong>Project:</strong> {selected.projectRef ?? timeline?.completion?.projectRef ?? "unknown"}</span><span><strong>Occurred:</strong> {formatDate(selected.occurredAt ?? timeline?.completion?.occurredAt)}</span><span><strong>Privacy:</strong> {selected.privacy ?? timeline?.completion?.privacy ?? "unknown"}</span></div><ProofList proof={selected.proof ?? timeline?.completion?.proof ?? []} /></div>}</InfoPanel>
        <InfoPanel title="Timeline, angles, comments, and revisions">{!timeline ? <p className="text-sm text-[var(--muted)]">Loading selected timeline…</p> : <div className="space-y-3 text-sm"><p>{timeline.timeline.length} timeline events · {timeline.angles.length} angles · {timeline.comments.length} comments · {timeline.revisions.length} revisions</p>{timeline.angles.length ? <ul className="space-y-2">{timeline.angles.map((angle, index) => <li key={angle.id ?? index} className="rounded-xl border border-[#dce8eb] bg-white p-3"><p className="font-semibold text-[#15323d]">{angle.title || "Angle title unavailable"}</p>{angle.provenance ? <p className="mt-1 text-xs text-[#0f7ea9]">{angle.provenance}</p> : null}</li>)}</ul> : <p>Angles unavailable from this candidate.</p>}{timeline.comments.map((entry, index) => <p key={entry.id ?? index} className="rounded-xl bg-[#edf7fa] p-3">{entry.body || "Comment text unavailable"}</p>)}</div>}</InfoPanel>
        <InfoPanel title="Comment to improve"><label htmlFor="review-comment" className="sr-only">Add review comment</label><textarea id="review-comment" value={comment} onChange={(event) => setComment(event.target.value)} disabled={!revision || pending} placeholder="Example: make the angle more boardy, less changelog, cite the deploy proof first." className="min-h-24 w-full rounded-xl border border-[#cbdde2] bg-white p-3 text-sm" /><button type="button" onClick={addComment} disabled={!comment.trim() || !revision || pending} className="mt-3 rounded-xl bg-[#15323d] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45">{pending ? "Saving…" : "Add comment and revise"}</button></InfoPanel>
        <div className="mt-5 rounded-[18px] bg-[#15323d] p-4 text-[#eef6f7]"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8cc8dd]">Exact server intent</p><label className="mt-3 block text-xs font-bold text-[#d7f1eb]" htmlFor="schedule-timestamp">Schedule timestamp</label><input id="schedule-timestamp" aria-describedby="schedule-timezone" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} disabled={pending} spellCheck={false} className="mt-1 w-full rounded-lg border border-white/30 bg-[#10282f] px-3 py-2 font-mono text-xs text-white disabled:opacity-45" /><p id="schedule-timezone" className="mt-2 text-xs text-[#b6ccd1]">Timezone: {timezoneFor(scheduledAt)}. This exact value is submitted unchanged.</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => deny()} disabled={!revision || pending} className="rounded-lg border border-red-300/40 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100 disabled:opacity-45">Deny</button><button type="button" onClick={() => submitDecision({ type: "approve_schedule", scheduledAt })} disabled={scheduleBlocked} title={scheduleBlocked && !releaseBlocked ? "Enter an exact future ISO timestamp with timezone." : releaseReason} className="rounded-lg bg-[#d7f1eb] px-3 py-2 text-sm font-bold text-[#13433d] disabled:opacity-45">Schedule</button><button type="button" onClick={() => submitDecision({ type: "approve_now" })} disabled={releaseBlocked} title={releaseReason} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold text-white disabled:opacity-45">Post now</button></div><p className="mt-3 text-xs text-[#b6ccd1]">{timeline?.release?.allowed ? `Bound to ${timeline.release.account} under ${timeline.release.policyVersion}.` : `Schedule and Post now are disabled: ${releaseReason}`}</p></div>
      </section>
    </div>
  </div>;
}

type LiveColumnId = "review" | "needs_work" | "scheduled" | "rejected";

const liveColumnDefs: Array<{ id: LiveColumnId; label: string; description: string; accent: string }> = [
  { id: "review", label: "Review", description: "Completed work waiting on proof and angle review", accent: "#0f7ea9" },
  { id: "needs_work", label: "Needs work", description: "Comment-driven revisions and angle changes", accent: "#9a6700" },
  { id: "scheduled", label: "Scheduled intent", description: "Guarded server decision, not provider publish", accent: "#0f766e" },
  { id: "rejected", label: "Rejected", description: "Denied candidates stay inspectable", accent: "#b5473d" },
];

function groupLiveCandidates(candidates: UiLiveCandidate[]) {
  return liveColumnDefs.reduce<Record<LiveColumnId, UiLiveCandidate[]>>((acc, column) => {
    acc[column.id] = candidates.filter((candidate) => liveColumnFor(candidate) === column.id);
    return acc;
  }, { review: [], needs_work: [], scheduled: [], rejected: [] });
}

function liveColumnFor(candidate: UiLiveCandidate): LiveColumnId {
  if (candidate.status === "rejected") return "rejected";
  if (candidate.status === "draft_review") return "needs_work";
  if (candidate.status === "scheduled" || candidate.status === "published") return "scheduled";
  return "review";
}

function candidateTitle(candidate: UiLiveCandidate | null | undefined) {
  if (!candidate) return "Select a candidate";
  if (candidate.summary) return candidate.summary.length > 86 ? `${candidate.summary.slice(0, 83)}...` : candidate.summary;
  return candidate.id;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "unavailable";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

function LiveCandidateCard({ candidate, selected, onOpen, onDragStart }: { candidate: UiLiveCandidate; selected: boolean; onOpen: () => void; onDragStart: () => void }) {
  return <article draggable onDragStart={onDragStart} className={cn("rounded-[18px] border p-4 transition", selected ? "border-[#68a7bf] bg-[#edf7fa] shadow-[0_10px_24px_rgba(15,126,169,0.12)]" : "border-[rgba(12,17,21,0.09)] bg-white hover:border-[#9dbec9]")}>
    <button type="button" onClick={onOpen} className="w-full text-left" aria-label={`Open ${candidate.id}`}>
      <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[#edf3f4] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#42626d]">{candidate.status || "unknown"}</span><ChevronRight className="h-4 w-4 shrink-0 text-[#55747e]" /></div>
      <h3 className="mt-3 font-serif text-[1.05rem] leading-5 text-[var(--ink)]">{candidateTitle(candidate)}</h3>
      <div className="mt-4 grid gap-2 text-xs text-[#49636c]"><span className="inline-flex items-center gap-1.5"><FileCheck2 className="h-3.5 w-3.5" /> {candidate.proof?.length ?? 0} proof link(s)</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {formatDate(candidate.occurredAt)}</span><span className="truncate">{candidate.sourceAgent ?? "unknown source"} · {candidate.projectRef ?? "unknown project"}</span></div>
      <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[#e8f4f7] px-2 py-1 text-[10px] font-bold text-[#0b5d7d]">rev {candidateRevision(candidate) ?? "?"}</span>{candidate.privacy ? <span className="rounded-full bg-[#eef4f2] px-2 py-1 text-[10px] font-bold text-[#38505a]">{candidate.privacy}</span> : null}</div>
    </button>
  </article>;
}

function ProofList({ proof }: { proof: NonNullable<UiLiveCandidate["proof"]> }) {
  if (!proof.length) return <p className="rounded-xl border border-dashed border-[#cbdde2] bg-white p-3 text-xs text-[var(--muted)]">No public proof link is attached yet.</p>;
  return <ul className="space-y-2">{proof.slice(0, 3).map((item, index) => <li key={`${item.uri}-${index}`} className="rounded-xl border border-[#dce8eb] bg-white p-3 text-xs"><a className="font-semibold text-[#0f7ea9] underline underline-offset-2" href={item.uri} target="_blank" rel="noreferrer">{item.type || "proof"} · {item.uri}</a>{item.verifiedAt ? <p className="mt-1 text-[#49636c]">verified {formatDate(item.verifiedAt)}</p> : null}</li>)}</ul>;
}

function messageFor(cause: unknown) { return cause instanceof WorkToPostUiError ? `${cause.message}${cause.status === 409 ? " Refresh the candidate and retry." : ""}` : "Unable to reach the live workspace. Check your session and retry."; }

function isExactFutureTimestamp(value: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
}

function timezoneFor(value: string) {
  if (value.endsWith("Z")) return "UTC";
  const offset = value.match(/([+-]\d{2}:\d{2})$/)?.[1];
  return offset ? `UTC${offset}` : "timezone required";
}

function CandidateCard({ card, selected, onOpen }: { card: WorkToPostDemoCard; selected: boolean; onOpen: () => void }) {
  const riskTone = card.risk === "low" ? "bg-emerald-50 text-emerald-700" : card.risk === "medium" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <article className={cn("rounded-[18px] border p-4 transition", selected ? "border-[#68a7bf] bg-[#edf7fa] shadow-[0_10px_24px_rgba(15,126,169,0.12)]" : "border-[rgba(12,17,21,0.09)] bg-white hover:border-[#9dbec9]")}>
    <button type="button" onClick={onOpen} className="w-full text-left" aria-label={`Open ${card.title}`}>
      <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[#edf3f4] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#42626d]">{card.stage}</span><ChevronRight className="h-4 w-4 shrink-0 text-[#55747e]" /></div>
      <h3 className="mt-3 font-serif text-[1.18rem] leading-5 text-[var(--ink)]">{card.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{card.summary}</p>
      <div className="mt-4 grid gap-2 text-xs text-[#49636c]"><span className="inline-flex items-center gap-1.5"><FileCheck2 className="h-3.5 w-3.5" /> {card.proof}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {card.freshness}</span><span className="truncate">{card.source}</span></div>
      <div className="mt-3 flex flex-wrap gap-2"><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em]", riskTone)}>{card.risk} risk</span>{card.dispatchLabel ? <span className="rounded-full bg-[#e7f5f1] px-2 py-1 text-[10px] font-bold text-[#0f766e]">{card.dispatchLabel}</span> : null}</div>
    </button>
  </article>;
}

function CandidateDrawer({ card, comment, onCommentChange, onAddComment, onDecision }: { card: WorkToPostDemoCard; comment: string; onCommentChange: (value: string) => void; onAddComment: () => void; onDecision: (value: "deny" | "schedule" | "publish") => void }) {
  return <section role="dialog" aria-modal="false" aria-labelledby="candidate-drawer-title" className="rounded-[28px] border border-[#d6e3e7] bg-[#f9fcfc] p-5 shadow-[0_22px_55px_rgba(12,17,21,0.12)] md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="section-eyebrow text-[var(--accent-tech)]">Review drawer · local fixture</p><h2 id="candidate-drawer-title" className="mt-2 font-serif text-3xl leading-none text-[var(--ink)]">{card.title}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{card.summary}</p></div>{card.dispatchLabel ? <span className="rounded-full bg-[#dff3ed] px-3 py-1.5 text-xs font-bold text-[#0f766e]">{card.dispatchLabel}</span> : null}</div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="space-y-5">
        <InfoPanel title="Proof and privacy"><div className="grid gap-3 sm:grid-cols-2"><p><FileCheck2 className="mr-2 inline h-4 w-4 text-[#0f7ea9]" />{card.proof}</p><p><LockKeyhole className="mr-2 inline h-4 w-4 text-[#0f7ea9]" />{card.privacy}</p></div><p className="mt-3 text-sm text-[var(--muted)]">Source: {card.source}. Proof links are fixture text only and never expose a transcript.</p></InfoPanel>
        <InfoPanel title="Three angles · cited provenance"><ol className="space-y-3">{workToPostDemoAngles.map((angle, index) => <li key={angle.title} className="rounded-xl border border-[#dce8eb] bg-white p-3"><p className="font-semibold text-[#15323d]">{index + 1}. {angle.title}</p><p className="mt-1 text-sm text-[var(--muted)]">{angle.copy}</p><p className="mt-2 text-xs font-semibold text-[#0f7ea9]">{angle.provenance}</p></li>)}</ol></InfoPanel>
        <InfoPanel title="Current revision and diff"><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#e8f4f7] px-3 py-1 text-sm font-bold text-[#0b5d7d]">Revision {card.revision}</span>{card.approved ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Approval current</span> : <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800"><ShieldAlert className="h-4 w-4" /> Approval invalidated by comment</span>}</div><pre className="mt-3 overflow-x-auto rounded-xl bg-[#17262b] p-3 text-xs leading-5 text-[#dbe8e9]">- claims publish outcome{`\n`}+ claims local simulated outcome</pre></InfoPanel>
        <InfoPanel title="Comments"><label htmlFor="review-comment" className="sr-only">Add review comment</label><textarea id="review-comment" value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder="Prompt text stays inert; comments create a local revision." className="min-h-24 w-full rounded-xl border border-[#cbdde2] bg-white p-3 text-sm outline-none focus:border-[#0f7ea9] focus:ring-2 focus:ring-[#0f7ea9]/20" /><button type="button" onClick={onAddComment} disabled={!comment.trim()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#15323d] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><MessageSquareText className="h-4 w-4" />Add comment</button></InfoPanel>
      </div>
      <div className="space-y-5"><InfoPanel title="Cited person dossier"><p className="font-semibold text-[#15323d]">Mina Ortega · developer experience lead</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Why this person: their recent public release notes discuss the same operator-proof problem.</p><ul className="mt-3 space-y-2 text-sm"><li><a className="font-semibold text-[#0f7ea9] underline underline-offset-2" href="https://example.com/mina-profile">Primary profile</a></li><li><a className="font-semibold text-[#0f7ea9] underline underline-offset-2" href="https://example.com/mina-notes">First-party release notes</a></li></ul></InfoPanel><InfoPanel title="Trace timeline"><ol className="space-y-3">{workToPostTrace.map(([time, event, detail]) => <li key={time} className="border-l-2 border-[#9ccbd8] pl-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0f7ea9]">{time} · {event}</p><p className="mt-1 text-sm text-[var(--muted)]">{detail}</p></li>)}</ol></InfoPanel><div className="rounded-[18px] bg-[#15323d] p-4 text-[#eef6f7]"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8cc8dd]">Exact local intent</p><div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1"><button type="button" onClick={() => onDecision("deny")} className="rounded-lg border border-red-300/40 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">Deny</button><button type="button" onClick={() => onDecision("schedule")} disabled={!card.approved} className="rounded-lg bg-[#d7f1eb] px-3 py-2 text-sm font-bold text-[#13433d] disabled:cursor-not-allowed disabled:opacity-45">Schedule</button><button type="button" onClick={() => onDecision("publish")} disabled={!card.approved} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><Send className="h-4 w-4" />Post now</button></div><p className="mt-3 text-xs leading-5 text-[#b6ccd1]">{card.approved ? "All three mutate fixture state only. No real approval or dispatch occurs." : "Schedule and Post now stay locked until the revised draft passes review."}</p></div></div>
    </div>
  </section>;
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[18px] border border-[#dce8eb] bg-[#fdfefe] p-4"><h3 className="font-serif text-xl text-[#15323d]">{title}</h3><div className="mt-3">{children}</div></section>; }
