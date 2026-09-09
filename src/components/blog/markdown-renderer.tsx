import Image from "next/image";
import type { ReactNode } from "react";

type Props = {
  markdown: string;
};

export function BlogMarkdownRenderer({ markdown }: Props) {
  const blocks = splitMarkdownBlocks(markdown);
  let skippedTitle = false;

  return (
    <div className="prose prose-lg max-w-none text-[var(--ink-soft)] leading-relaxed">
      {blocks.map((block, index) => {
        if (!skippedTitle && /^#\s+/.test(block.trim())) {
          skippedTitle = true;
          return null;
        }
        return renderBlock(block, index);
      })}
    </div>
  );
}

function splitMarkdownBlocks(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: { char: string; length: number } | undefined;
  const flush = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { char: marker[0], length: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = undefined;
      }
      current.push(line);
      if (!fence) flush();
      continue;
    }
    if (!fence && !line.trim()) {
      flush();
      continue;
    }
    if (!fence && /^#{1,3}\s+/.test(line)) {
      flush();
      current.push(line);
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

function renderBlock(block: string, index: number): ReactNode {
  const lines = block.split("\n");
  const first = lines[0].trim();
  const fence = first.match(/^(\x60{3,}|~{3,})(.*)$/);
  if (fence && lines.length >= 2) {
    const last = lines[lines.length - 1].trim();
    const closing = new RegExp(
      "^" + fence[1][0] + "{" + fence[1].length + ",}\\s*$",
    ).test(last);
    const codeLines = closing ? lines.slice(1, -1) : lines.slice(1);
    const language = fence[2].trim().split(/\s+/)[0];
    return (
      <pre
        key={index}
        className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--ink)] p-4 text-sm text-[var(--paper)]"
        style={{ overflowWrap: "anywhere" }}
      >
        <code className={language ? "language-" + language : undefined}>
          {codeLines.join("\n")}
        </code>
      </pre>
    );
  }

  const image = block.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
  if (image?.[2] && /^https:/.test(image[2])) {
    return (
      <figure
        key={index}
        className="my-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)]"
      >
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

  if (/^###\s+/.test(first)) {
    return (
      <h3 key={index} className="mb-3 mt-8 text-xl font-semibold text-[var(--ink)]">
        {renderInline(first.replace(/^###\s+/, ""))}
      </h3>
    );
  }

  if (/^##\s+/.test(first)) {
    return (
      <h2 key={index} className="mb-4 mt-10 text-2xl font-semibold text-[var(--ink)]">
        {renderInline(first.replace(/^##\s+/, ""))}
      </h2>
    );
  }

  if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
    return (
      <ul key={index} className="mb-6 list-disc space-y-2 pl-6 text-[0.95rem] leading-[1.75]">
        {lines.map((line, itemIndex) => (
          <li key={itemIndex}>
            {renderInline(line.trim().replace(/^[-*]\s+/, ""))}
          </li>
        ))}
      </ul>
    );
  }

  if (lines.every((line) => /^\d+\.\s+/.test(line.trim()))) {
    return (
      <ol key={index} className="mb-6 list-decimal space-y-2 pl-6 text-[0.95rem] leading-[1.75]">
        {lines.map((line, itemIndex) => (
          <li key={itemIndex}>
            {renderInline(line.trim().replace(/^\d+\.\s+/, ""))}
          </li>
        ))}
      </ol>
    );
  }

  if (lines.every((line) => /^>\s?/.test(line.trim()))) {
    return (
      <blockquote
        key={index}
        className="my-6 rounded-xl border-l-4 border-[var(--accent-tech)] bg-[var(--paper)] px-5 py-4 text-[1rem] leading-[1.75] text-[var(--ink)]"
      >
        {renderInline(lines.map((line) => line.trim().replace(/^>\s?/, "")).join("\n"))}
      </blockquote>
    );
  }

  return (
    <p key={index} className="mb-5 text-[0.95rem] leading-[1.75]">
      {renderInline(block)}
    </p>
  );
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\x60") {
      const run = text.slice(index).match(/^\x60+/)?.[0] ?? "\x60";
      const end = text.indexOf(run, index + run.length);
      if (end >= 0) {
        parts.push(<code key={"code-" + index}>{text.slice(index + run.length, end)}</code>);
        index = end + run.length;
        continue;
      }
    }
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end >= 0) {
        parts.push(
          <strong key={"strong-" + index} className="font-semibold text-[var(--ink)]">
            {renderInline(text.slice(index + 2, end))}
          </strong>,
        );
        index = end + 2;
        continue;
      }
    }
    const link = text.slice(index).match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    if (link) {
      parts.push(
        <a
          key={"link-" + index}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-tech)] underline-offset-4 hover:underline"
        >
          {link[1]}
        </a>,
      );
      index += link[0].length;
      continue;
    }
    parts.push(text[index]);
    index += 1;
  }
  return parts;
}
