import { ExternalLink, Info } from "lucide-react";
import type { ConnectionMethod } from "@/lib/connection-catalog";

export function getUniqueConnectionDocs(docs: ConnectionMethod["docs"]) {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.url)) return false;
    seen.add(doc.url);
    return true;
  });
}

export function ConnectionDocButton({
  docs,
  label,
}: {
  docs: ConnectionMethod["docs"];
  label: string;
}) {
  const doc = getUniqueConnectionDocs(docs)[0];
  if (!doc) return null;

  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noreferrer"
      title={`${label}: ${doc.label}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(33,25,19,0.1)] bg-white text-[#5e4e42] transition hover:border-[rgba(15,126,169,0.28)] hover:text-[var(--accent-tech)]"
    >
      <Info className="h-4 w-4" />
      <span className="sr-only">
        {label}: {doc.label}
      </span>
    </a>
  );
}

export function ConnectionDocPillLinks({
  docs,
}: {
  docs: ConnectionMethod["docs"];
}) {
  return (
    <>
      {getUniqueConnectionDocs(docs).map((doc) => (
        <a
          key={doc.url}
          href={doc.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-[rgba(33,25,19,0.1)] px-2.5 py-1 text-xs font-semibold text-[#5e4e42]"
        >
          <Info className="h-3.5 w-3.5" />
          {doc.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </>
  );
}
