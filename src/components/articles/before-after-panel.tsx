import Link from "next/link";
import {
  COMPARE_BEFORE_STAGES,
  type CompareBeforeStage,
  type CompareDiffOp,
  type CompareStageMeasure,
  type FingerprintCompare,
} from "@/lib/article-agent/pipeline-compare-types";

type MetricRow = { key: string; label: string; read: (stage: CompareStageMeasure) => number | undefined };

const METRICS: MetricRow[] = [
  { key: "composite", label: "Composite", read: (s) => s.contract.composite },
  { key: "template_hits", label: "Template hits", read: (s) => s.contract.values.template_hits },
  { key: "transition_excess", label: "Transition excess", read: (s) => s.contract.values.transition_excess },
  { key: "repeated_ngram", label: "Repeated n-gram", read: (s) => s.contract.values.repeated_ngram },
  { key: "sentence_regularity", label: "Sentence regularity", read: (s) => s.author.values.sentence_regularity },
  { key: "paragraph_regularity", label: "Paragraph regularity", read: (s) => s.author.values.paragraph_regularity },
  { key: "burstiness", label: "Burstiness", read: (s) => s.author.values.burstiness },
  { key: "author_distance", label: "Author distance", read: (s) => s.author.values.author_distance },
];

const EPSILON = 0.0001;

export function parseBeforeStage(value: string | string[] | undefined): CompareBeforeStage {
  const first = Array.isArray(value) ? value[0] : value;
  return COMPARE_BEFORE_STAGES.find((stage) => stage === first) ?? "draft";
}

export function isWorse(direction: "high" | "low" | undefined, delta: number) {
  if (Math.abs(delta) < EPSILON) return false;
  return direction === "low" ? delta < 0 : delta > 0;
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

function format(value: number | undefined) {
  return value === undefined ? "-" : value.toFixed(3);
}

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(3)}`;
}

export function BeforeAfterPanel({
  slug,
  data,
  before,
}: {
  slug: string;
  data: FingerprintCompare | { error: string };
  before: CompareBeforeStage;
}) {
  if ("error" in data) {
    return (
      <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">Before / After</h2>
        <p className="mt-4 text-sm text-[#a3342a]">{data.error}</p>
      </section>
    );
  }

  const beforeStage = data.stages[before];
  const afterStage = data.stages.final;
  const ops = data.diffs[before]?.ops ?? [];

  return (
    <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-6" data-testid="before-after-panel">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">Before / After</h2>

      <nav className="mt-4 flex flex-wrap gap-2">
        {COMPARE_BEFORE_STAGES.map((stage) => {
          const active = stage === before;
          return (
            <Link
              key={stage}
              href={`/dashboard/articles/${encodeURIComponent(slug)}?before=${stage}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                active
                  ? "border-[#5f523f] bg-[#5f523f] text-white"
                  : "border-[#d4c6b1] bg-[#fffaf2] text-[#5f523f] hover:underline"
              }`}
            >
              {fileName(data.stages[stage].path)}
            </Link>
          );
        })}
      </nav>

      <table className="mt-5 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#eadfce] text-xs uppercase tracking-[0.12em] text-[#806f58]">
            <th className="py-2 pr-3 font-semibold">Metric</th>
            <th className="px-3 py-2 text-right font-semibold">Before</th>
            <th className="px-3 py-2 text-right font-semibold">After</th>
            <th className="py-2 pl-3 text-right font-semibold">Delta</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => {
            const b = metric.read(beforeStage);
            const a = metric.read(afterStage);
            const delta = b === undefined || a === undefined ? 0 : a - b;
            const worse = b !== undefined && a !== undefined && isWorse(data.bad_direction[metric.key], delta);
            return (
              <tr key={metric.key} className="border-b border-[#f4ebdd]">
                <td className="py-2 pr-3 text-[#171717]">{metric.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[#5f523f]">{format(b)}</td>
                <td
                  data-worse={worse ? "true" : "false"}
                  className={`px-3 py-2 text-right tabular-nums ${worse ? "bg-[#fbe3df] font-semibold text-[#a3342a]" : "text-[#171717]"}`}
                >
                  {format(a)}
                </td>
                <td
                  className={`py-2 pl-3 text-right tabular-nums ${worse ? "font-semibold text-[#a3342a]" : "text-[#5f523f]"}`}
                >
                  {b === undefined || a === undefined ? "-" : formatDelta(delta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-6 space-y-2 text-sm leading-6 text-[#171717]" data-testid="sentence-diff">
        {ops.map((op, index) => (
          <DiffOp key={index} op={op} />
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">Kept edits</h3>
          <ul className="mt-3 space-y-2">
            {data.edits.kept.map((edit, index) => (
              <li key={index} className="rounded-[14px] bg-[#fffaf2] px-3 py-2">
                <p className="text-xs font-semibold text-[#806f58]">{edit.stage}</p>
                <p className="mt-1 text-sm text-[#171717]">{edit.sentence}</p>
                {edit.replacement ? <p className="mt-1 text-sm text-[#2f6b2a]">{edit.replacement}</p> : null}
                <p className="mt-1 text-xs text-[#806f58]">{edit.reason}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">Rejected edits</h3>
          <ul className="mt-3 space-y-2">
            {data.edits.rejected.map((edit, index) => (
              <li key={index} className="rounded-[14px] bg-[#fffaf2] px-3 py-2">
                <p className="text-xs font-semibold text-[#806f58]">
                  {edit.stage} {edit.at}
                </p>
                {edit.reasons.map((reason, i) => (
                  <p key={i} className="mt-1 text-xs text-[#806f58]">
                    {reason}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function DiffOp({ op }: { op: CompareDiffOp }) {
  const removed = op.op === "delete" || op.op === "replace" ? op.a : [];
  const added = op.op === "insert" || op.op === "replace" ? op.b : [];
  if (op.op === "equal") return <p className="text-[#5f523f]">{op.a.join(" ")}</p>;
  return (
    <p>
      {removed.length ? (
        <del className="bg-[#fbe3df] text-[#a3342a] line-through decoration-[#a3342a]">{removed.join(" ")}</del>
      ) : null}
      {removed.length && added.length ? " " : null}
      {added.length ? <ins className="bg-[#dcefd5] text-[#1f4d1a] no-underline">{added.join(" ")}</ins> : null}
    </p>
  );
}
