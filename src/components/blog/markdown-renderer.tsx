import Image from "next/image";
import type { ReactNode } from "react";

type Props = {
  markdown: string;
};

export function BlogMarkdownRenderer({ markdown }: Props) {
  const blocks = markdown
    .replace(/^#\s+.+\n+/, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="prose prose-lg max-w-none text-[var(--ink-soft)] leading-relaxed">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: string, index: number) {
  const image = block.match(/^!\[([^\]]*)]\((https?:\/\/[^)]+)\)$/);
  if (image?.[2]) {
    return (
      <figure key={index} className="my-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
        <Image
          src={image[2]}
          alt={image[1] || "Article image"}
          width={1200}
          height={675}
          className="h-auto w-full object-cover"
          unoptimized
        />
        {image[1] ? (
          <figcaption className="px-4 py-3 text-xs text-[var(--muted)]">
            {image[1]}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.startsWith("## ")) {
    return (
      <h2 key={index} className="mb-4 mt-10 text-2xl font-semibold text-[var(--ink)]">
        {renderInline(block.slice(3))}
      </h2>
    );
  }

  if (block.startsWith("### ")) {
    return (
      <h3 key={index} className="mb-3 mt-8 text-xl font-semibold text-[var(--ink)]">
        {renderInline(block.slice(4))}
      </h3>
    );
  }

  if (block.startsWith(">")) {
    const quote = block
      .split("\n")
      .map((line) => line.replace(/^>\s?/, ""))
      .join(" ");
    return (
      <blockquote
        key={index}
        className="my-6 rounded-xl border-l-4 border-[var(--accent-tech)] bg-[var(--paper)] px-5 py-4 text-[1rem] leading-[1.75] text-[var(--ink)]"
      >
        {renderInline(quote)}
      </blockquote>
    );
  }

  if (block.startsWith("- ") || block.includes("\n- ")) {
    const items = block
      .split("\n")
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => line.trim().slice(2));
    return (
      <ul key={index} className="mb-6 list-disc space-y-2 pl-6 text-[0.95rem] leading-[1.75]">
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }

  if (/^\d+\.\s/.test(block) || /\n\d+\.\s/.test(block)) {
    const items = block
      .split("\n")
      .filter((line) => /^\d+\.\s/.test(line.trim()))
      .map((line) => line.trim().replace(/^\d+\.\s/, ""));
    return (
      <ol key={index} className="mb-6 list-decimal space-y-2 pl-6 text-[0.95rem] leading-[1.75]">
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }

  return (
    <p key={index} className="mb-5 text-[0.95rem] leading-[1.75]">
      {renderInline(block.replace(/\n/g, " "))}
    </p>
  );
}

function renderInline(text: string) {
  const parts: ReactNode[] = [];
  const regex = /\[([^\]]+)]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      parts.push(
        <a
          key={`${match.index}-link`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-tech)] underline-offset-4 hover:underline"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <strong key={`${match.index}-strong`} className="font-semibold text-[var(--ink)]">
          {match[3]}
        </strong>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
