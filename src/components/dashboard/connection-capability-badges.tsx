import type { ConnectionPlatformDefinition } from "@/lib/connection-catalog";

export function ConnectionCapabilityBadges({
  definition,
}: {
  definition: ConnectionPlatformDefinition;
}) {
  const capabilities = definition.capabilities ?? [];
  const futureCapabilities = definition.futureCapabilities ?? [];
  const labels = [
    ...capabilities.map((capability) => ({ capability, planned: false })),
    ...futureCapabilities.map((capability) => ({ capability, planned: true })),
  ];

  if (labels.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {labels.map(({ capability, planned }) => (
        <span
          key={`${capability}-${planned ? "planned" : "live"}`}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
            planned
              ? "border-[rgba(33,25,19,0.1)] bg-[#fffaf2] text-[#7a6756]"
              : "border-[rgba(47,123,79,0.18)] bg-[#eef8f1] text-[#2f7b4f]"
          }`}
        >
          {planned ? `${capability} next` : capability}
        </span>
      ))}
    </div>
  );
}
