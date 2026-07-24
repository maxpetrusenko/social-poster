"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, GitPullRequest, ShieldCheck } from "lucide-react";
import { workToPostMetrics, workToPostTrace } from "@/lib/work-to-post/ui-fixtures";
import { workToPostFetch, type UiLearningProposal, type UiLiveCandidate, type UiLiveTimeline } from "@/lib/work-to-post/ui-live";

const funnel = [["Captured", workToPostMetrics.captured, "#6ba8be"], ["Proof ready", workToPostMetrics.proofReady, "#4d98ae"], ["Angles ready", workToPostMetrics.angleReady, "#387b93"], ["Approved", workToPostMetrics.approved, "#215d73"], ["Simulated published", workToPostMetrics.simulatedPublished, "#0f4c5c"]] as const;
type TraceItem = (typeof workToPostTrace)[number];

export function WorkToPostAnalytics() {
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  return <div className="space-y-5"><div className="flex flex-wrap gap-2" role="group" aria-label="Analytics data mode"><button type="button" aria-pressed={mode === "fixture"} onClick={() => setMode("fixture")} className="rounded-full border border-[#b8d4dd] bg-white px-3 py-2 text-sm font-bold text-[#15323d]">Fixture demo</button><button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")} className="rounded-full border border-[#0f7ea9] bg-[#e8f4f7] px-3 py-2 text-sm font-bold text-[#0b5d7d]">Live workspace</button></div>{mode === "fixture" ? <FixtureAnalytics /> : <LiveAnalytics />}</div>;
}

function FixtureAnalytics() {
  const [trace, setTrace] = useState<TraceItem>(workToPostTrace[0]);
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Clock3 />} label="Median review time" value={workToPostMetrics.medianReviewHours} note="capture → decision" /><Metric icon={<GitPullRequest />} label="Revisions / approval" value={workToPostMetrics.revisionsPerApproval} note="fixture cohort" /><Metric icon={<CheckCircle2 />} label="Learning proposals" value={workToPostMetrics.learningProposals} note="candidate-scoped" /><Metric icon={<ShieldCheck />} label="Reliable proof rate" value={workToPostMetrics.reliableProofRate} note="allowlisted fixtures" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]"><section className="rounded-[24px] border border-[#d6e3e7] bg-white/85 p-5 shadow-[0_16px_38px_rgba(12,17,21,0.07)]"><p className="section-eyebrow text-[#0f7ea9]">Fixture funnel</p><h2 className="mt-1 font-serif text-3xl text-[var(--ink)]">Proof narrows the publishable work.</h2><p className="mt-2 text-sm text-[var(--muted)]">Counts are a local demo projection, not production reporting.</p><div className="mt-6 space-y-4">{funnel.map(([label, value, color]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold text-[#264550]">{label}</span><span className="text-[var(--muted)]">{value}</span></div><div className="h-3 overflow-hidden rounded-full bg-[#e7eff1]"><div className="h-full rounded-full" style={{ width: `${(value / funnel[0][1]) * 100}%`, backgroundColor: color }} /></div></div>)}</div></section><section className="rounded-[24px] border border-[#eadfc2] bg-[#fffdf5] p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-1 h-5 w-5 text-[#9a6700]" /><div><h2 className="font-serif text-2xl text-[#5d420c]">Correlation, not causation</h2><p className="mt-2 text-sm leading-6 text-[#715a27]">This fixture can show that proof quality and outcomes move together. It cannot establish that a given angle, reviewer, or dossier caused reach.</p></div></div><div className="mt-5 border-t border-[#eadfc2] pt-4"><h3 className="font-semibold text-[#5d420c]">Missing metrics</h3><ul className="mt-2 space-y-2 text-sm text-[#715a27]"><li>Audience exposure and platform-side ranking are absent.</li><li>No controlled comparison or attribution window exists.</li><li>Person dossier relevance is reviewed, not inferred from conversion.</li></ul></div></section></div>
    <section className="rounded-[24px] border border-[#d6e3e7] bg-[#f7fbfc] p-5"><h2 className="section-eyebrow text-[#0f7ea9]">Trace explorer</h2><p className="mt-1 font-serif text-3xl text-[var(--ink)]">Inspect the handoff, not a black box.</p><div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"><div className="space-y-2">{workToPostTrace.map((item) => <button key={item[0]} type="button" onClick={() => setTrace(item)} className="flex w-full items-center justify-between rounded-xl border border-[#d5e3e6] bg-white px-4 py-3 text-left hover:border-[#69a9bf] focus:outline-none focus:ring-2 focus:ring-[#0f7ea9]"><span className="font-semibold text-[#264550]">{item[1]}</span><ArrowRight className="h-4 w-4 text-[#0f7ea9]" /></button>)}</div><div aria-live="polite" className="rounded-[18px] bg-[#15323d] p-5 text-[#edf7f8]"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#8cc8dd]">{trace[0]}</p><h3 className="mt-2 font-serif text-2xl">{trace[1]}</h3><p className="mt-3 text-sm leading-6 text-[#c6dadd]">{trace[2]}</p><p className="mt-6 border-t border-white/15 pt-3 text-xs text-[#9fc1ca]">Sanitized trace reference · fixture-only · raw transcript unavailable</p></div></div></section>
  </div>;
}

function LiveAnalytics() {
  const [candidates, setCandidates] = useState<UiLiveCandidate[]>([]);
  const [timelines, setTimelines] = useState<UiLiveTimeline[]>([]);
  const [proposals, setProposals] = useState<UiLearningProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [candidateResult, learningResult] = await Promise.all([workToPostFetch<{ candidates?: UiLiveCandidate[] }>("/api/work-to-post/candidates"), workToPostFetch<{ proposals?: UiLearningProposal[] }>("/api/work-to-post/learning")]);
        const next = Array.isArray(candidateResult.candidates) ? candidateResult.candidates : [];
        const details = await Promise.all(next.map((candidate) => workToPostFetch<UiLiveTimeline>(`/api/work-to-post/candidates/${encodeURIComponent(candidate.id)}/timeline`)));
        if (active) { setCandidates(next); setTimelines(details); setProposals(Array.isArray(learningResult.proposals) ? learningResult.proposals : []); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Unable to load live analytics."); }
    }
    void load(); return () => { active = false; };
  }, []);
  const revisions = timelines.reduce((total, item) => total + item.revisions.length, 0);
  const reviewReady = candidates.filter((candidate) => candidate.status !== "needs_proof").length;
  return <div className="space-y-5"><div className="rounded-[18px] border border-[#d8e3e7] bg-[#f3f8f9] px-4 py-3 text-sm text-[#38505a]"><strong className="text-[#15323d]">Live workspace summary.</strong> Counts come from authenticated candidate, timeline, and learning routes; they are not provider analytics.</div>{error ? <p role="alert" className="rounded-xl border border-[#edc4bd] bg-[#fff5f2] px-4 py-3 text-sm text-[#9d2f20]">{error}</p> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Clock3 />} label="Candidates" value={candidates.length} note="server list" /><Metric icon={<GitPullRequest />} label="Timeline revisions" value={revisions} note="candidate-derived" /><Metric icon={<CheckCircle2 />} label="Learning proposals" value={proposals.length} note="server list" /><Metric icon={<ShieldCheck />} label="Past proof gate" value={reviewReady} note="status-derived, not approval" /></div>}<section className="rounded-[24px] border border-[#eadfc2] bg-[#fffdf5] p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-1 h-5 w-5 text-[#9a6700]" /><div><h2 className="font-serif text-2xl text-[#5d420c]">Correlation, not causation</h2><p className="mt-2 text-sm leading-6 text-[#715a27]">Live counts still cannot establish that a given angle, reviewer, or dossier caused reach. Audience exposure, platform ranking, and controlled attribution are absent.</p></div></div></section></div>;
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string | number; note: string }) { return <section className="rounded-[20px] border border-[#d6e3e7] bg-white/90 p-4 shadow-[0_12px_30px_rgba(12,17,21,0.06)]"><div className="flex items-center gap-2 text-[#0f7ea9]"><span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span><p className="text-xs font-bold uppercase tracking-[0.12em]">{label}</p></div><p className="mt-4 font-serif text-3xl text-[#15323d]">{value}</p><p className="mt-1 text-xs text-[var(--muted)]">{note}</p></section>; }
