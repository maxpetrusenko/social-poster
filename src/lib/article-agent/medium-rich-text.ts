import { formatArticleMarkdownForMedium, splitMediumMarkdownBlocks } from "@/lib/article-agent/medium-format";

export function formatArticleForMediumClipboard(markdown: string) {
  const plainText = formatArticleMarkdownForMedium(markdown);
  return {
    plainText,
    html: markdownToMediumHtml(plainText),
  };
}

function markdownToMediumHtml(markdown: string) {
  const blocks = splitMediumMarkdownBlocks(markdown);
  const html = blocks.map(renderBlock).join("\n");
  return [
    "<!doctype html>",
    "<html>",
    "<body>",
    "<!--StartFragment-->",
    html,
    "<!--EndFragment-->",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderBlock(block: string) {
  const image = block.match(/^!\[([^\]]*)]\((https?:\/\/[^)]+)\)$/i);
  if (image?.[2]) {
    const alt = escapeHtml(image[1] || "Article image");
    const src = escapeAttribute(image[2]);
    return `<figure><img src="${src}" alt="${alt}"></figure>`;
  }

  if (block.startsWith("# ")) return `<h1>${renderInline(block.slice(2))}</h1>`;
  if (block.startsWith("## ")) return `<h2>${renderInline(block.slice(3))}</h2>`;
  if (block.startsWith("#### ")) return `<h4>${renderInline(block.slice(5))}</h4>`;
  if (block.startsWith("### ")) return `<h3>${renderInline(block.slice(4))}</h3>`;

  if (block.startsWith("> ")) {
    return `<blockquote><p>${renderInline(block.slice(2).replace(/\n/g, " "))}</p></blockquote>`;
  }

  if (block.startsWith("```")) {
    const code = block.replace(/^```\w*\n?/, "").replace(/```$/, "").trimEnd();
    if (block.startsWith("```text")) {
      return `<blockquote><p>${renderInline(code.replace(/\n/g, " "))}</p></blockquote>`;
    }
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }

  if (block.startsWith("- ") || block.includes("\n- ")) {
    const items = block
      .split("\n")
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => `<li>${renderInline(line.trim().slice(2))}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  return `<p>${renderInline(block.replace(/\n/g, " "))}</p>`;
}

function renderInline(text: string) {
  const parts: string[] = [];
  const regex = /\[([^\]]+)]\((https?:\/\/[^)]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(escapeHtml(text.slice(lastIndex, match.index)));

    if (match[1] && match[2]) {
      parts.push(`<a href="${escapeAttribute(match[2])}">${escapeHtml(match[1])}</a>`);
    } else if (match[3]) {
      parts.push(`<strong><em>${escapeHtml(match[3])}</em></strong>`);
    } else if (match[4]) {
      parts.push(`<strong>${escapeHtml(match[4])}</strong>`);
    } else if (match[5]) {
      parts.push(`<em>${escapeHtml(match[5])}</em>`);
    } else if (match[6]) {
      parts.push(`<code>${escapeHtml(match[6])}</code>`);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
