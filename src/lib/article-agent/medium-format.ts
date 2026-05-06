export function formatArticleMarkdownForMedium(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const formatted: string[] = [];
  let inCodeBlock = false;
  let inNumberedList = false;
  let inBlockquote = false;
  let lastLineWasListItem = false;
  let skippingBlankLinesAfterHeader = false;
  let blockquoteLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1] ?? "";
    const previousLine = lines[index - 1] ?? "";
    const isListItem = /^\d+[).]\s/.test(line);

    if (isListItem) {
      inNumberedList = true;
      const match = line.match(/^(\d+)[).]\s+(.*)/);
      if (match) {
        formatted.push(removeEmojis(escapeCurrencyOutsideCode(`- **${match[1]}.** ${match[2]}`)));
        lastLineWasListItem = true;
        continue;
      }
    }

    if (inNumberedList && !isListItem && line.trim() && !line.startsWith("#")) {
      inNumberedList = false;
    }

    if (!line.trim() && lastLineWasListItem && /^\d+[).]\s/.test(nextLine)) {
      lastLineWasListItem = false;
      continue;
    }

    if (line.trim() === "***" || line.trim() === "---") {
      const isBeforeBio = nextLine.includes("*[") || nextLine.includes("Read next") || nextLine.toLowerCase().includes("max");
      const isBeforeSources = nextLine.startsWith("## Sources");
      if (!isBeforeBio && !isBeforeSources) continue;
    }

    if (!line.trim()) {
      if (/^#{2,4}\s/.test(previousLine.trim())) {
        skippingBlankLinesAfterHeader = true;
        continue;
      }
      if (skippingBlankLinesAfterHeader) continue;
    } else {
      skippingBlankLinesAfterHeader = false;
    }

    lastLineWasListItem = isListItem;

    if (line.startsWith("```")) {
      if (!inCodeBlock && previousLine.trim()) formatted.push("");
      formatted.push(line);
      if (inCodeBlock && nextLine.trim()) formatted.push("");
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      formatted.push(line);
      continue;
    }

    if (isRelativeMarkdownImage(line)) continue;

    if (isTableLine(line) || isTableSeparator(line)) {
      const table = parseTable(lines, index);
      formatted.push(...convertTableToAtomicUnits(table.rows));
      index = table.endIndex - 1;
      continue;
    }

    if (line.startsWith(">")) {
      if (!inBlockquote) {
        inBlockquote = true;
        blockquoteLines = [];
      }
      blockquoteLines.push(removeEmojis(line.replace(/^>\s?/, "")));
      if (!nextLine.startsWith(">")) {
        formatted.push(`> ${joinWrappedProseLines(blockquoteLines)}`);
        inBlockquote = false;
        blockquoteLines = [];
      }
      continue;
    }

    let processedLine = line.replace(/^###\s+(.+)$/, "#### $1");
    processedLine = escapeCurrencyOutsideCode(processedLine);
    processedLine = removeEmojis(processedLine);
    if (!processedLine.trim() && line.trim() && !line.startsWith("#")) continue;
    formatted.push(processedLine);
  }

  return formatted.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

export function splitMediumMarkdownBlocks(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(paragraph.join("\n"));
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const codeLines = [line];
      index += 1;
      while (index < lines.length) {
        codeLines.push(lines[index] ?? "");
        if ((lines[index] ?? "").trim().startsWith("```")) {
          index += 1;
          break;
        }
        index += 1;
      }
      blocks.push(codeLines.join("\n"));
      continue;
    }

    if (isStandaloneMediumLine(trimmed)) {
      flushParagraph();
      blocks.push(trimmed);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph();
      const listLines = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("- ")) {
        listLines.push((lines[index] ?? "").trim());
        index += 1;
      }
      blocks.push(listLines.join("\n"));
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function removeEmojis(text: string) {
  return text
    .replace(/[\u2700-\u27BF\u2600-\u26FF\u2B00-\u2BFF]/g, "")
    .replace(/[✓✗✔✕✖❌⚠️⭐🆗✅]/g, "")
    .replace(/  +/g, " ")
    .trimEnd();
}

function escapeCurrencyOutsideCode(line: string) {
  if (!line.includes("`")) return line.replace(/(?<!\\)\$(\d)/g, (_match, digit: string) => `\\$${digit}`);
  return line
    .split("`")
    .map((part, index) => index % 2 === 0 ? part.replace(/(?<!\\)\$(\d)/g, (_match, digit: string) => `\\$${digit}`) : part)
    .join("`");
}

function isTableLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function isRelativeMarkdownImage(line: string) {
  const match = line.trim().match(/^!\[[^\]]*]\(([^)]+)\)$/);
  if (!match?.[1]) return false;
  return !/^(https?:|data:|blob:|\/api\/)/i.test(match[1]);
}

function isTableSeparator(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  return trimmed
    .slice(1, -1)
    .split("|")
    .every((cell) => /^:?-+:?$/.test(cell.trim()));
}

function parseTable(lines: string[], startIndex: number) {
  const rows: string[][] = [];
  let index = startIndex + 1;
  if (index < lines.length && isTableSeparator(lines[index] ?? "")) index += 1;

  while (index < lines.length && (isTableLine(lines[index] ?? "") || isTableSeparator(lines[index] ?? ""))) {
    if (!isTableSeparator(lines[index] ?? "")) {
      rows.push(
        (lines[index] ?? "")
          .split("|")
          .filter((cell) => cell.trim())
          .map((cell) => cell.trim())
      );
    }
    index += 1;
  }

  return { rows, endIndex: index };
}

function convertTableToAtomicUnits(rows: string[][]) {
  const output = [""];
  for (const row of rows) {
    const label = row[0]?.replace(/\*\*/g, "").trim();
    if (!label) continue;
    const values = row.slice(1).map((cell) => cell.replace(/\*\*/g, "").trim()).filter(Boolean);
    output.push(values.length ? `**${label}** ${values.join(" ")}` : `**${label}**`);
  }
  output.push("");
  return output;
}

function joinWrappedProseLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStandaloneMediumLine(line: string) {
  return /^#{1,4}\s/.test(line) || /^!\[[^\]]*]\(https?:\/\/[^)]+\)$/i.test(line) || line.startsWith("> ");
}
