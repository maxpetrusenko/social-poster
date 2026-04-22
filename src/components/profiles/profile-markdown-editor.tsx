import { Bold, Code2, Eye, Heading1, Heading2, List, Pilcrow, Quote } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(true);
  const tokens = useMemo(() => renderMarkdown(value), [value]);

  function wrapSelection(before: string, after = before) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefixLine(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    onChange(`${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`);
    requestAnimationFrame(() => textarea.focus());
  }

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#d6d6d6] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e8e8] bg-[#fafafa] px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <ToolbarButton label="H1" icon={Heading1} onClick={() => prefixLine("# ")} />
          <ToolbarButton label="H2" icon={Heading2} onClick={() => prefixLine("## ")} />
          <ToolbarButton label="Bold" icon={Bold} onClick={() => wrapSelection("**")} />
          <ToolbarButton label="List" icon={List} onClick={() => prefixLine("- ")} />
          <ToolbarButton label="Quote" icon={Quote} onClick={() => prefixLine("> ")} />
          <ToolbarButton label="Code" icon={Code2} onClick={() => wrapSelection("`")} />
        </div>
        <button
          type="button"
          onClick={() => setPreview((current) => !current)}
          className="inline-flex items-center gap-2 rounded-[7px] border border-[#d8d8d8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#303030] hover:bg-[#f2f2f2]"
        >
          {preview ? <Pilcrow className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? "Edit only" : "Preview"}
        </button>
      </div>
      <div className={preview ? "grid min-h-[680px] lg:grid-cols-2" : "min-h-[680px]"}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="min-h-[680px] w-full resize-y border-0 bg-white p-5 font-mono text-[13px] leading-6 text-[#171717] outline-none"
        />
        {preview ? (
          <div className="min-h-[680px] border-t border-[#e8e8e8] bg-[#fcfcfc] p-5 lg:border-l lg:border-t-0">
            <div className="prose-lite space-y-3 text-sm leading-6 text-[#262626]">
              {tokens}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[#333] hover:bg-[#ededed]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function renderMarkdown(value: string) {
  const lines = value.split("\n");
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  function flushList(index: number) {
    if (list.length === 0) return;
    nodes.push(
      <ul key={`list-${index}`} className="list-disc space-y-1 pl-5">
        {list.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}
      </ul>
    );
    list = [];
  }

  function flushCode(index: number) {
    if (code.length === 0) return;
    nodes.push(
      <pre key={`code-${index}`} className="overflow-auto rounded-[8px] bg-[#171717] p-3 text-xs leading-5 text-white">
        <code>{code.join("\n")}</code>
      </pre>
    );
    code = [];
  }

  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      if (inCode) flushCode(index);
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      return;
    }
    flushList(index);
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={index} className="text-2xl font-semibold text-[#111]">{inlineMarkdown(line.slice(2))}</h1>);
    } else if (line.startsWith("## ")) {
      nodes.push(<h2 key={index} className="pt-3 text-lg font-semibold text-[#171717]">{inlineMarkdown(line.slice(3))}</h2>);
    } else if (line.startsWith("### ")) {
      nodes.push(<h3 key={index} className="pt-2 text-base font-semibold text-[#222]">{inlineMarkdown(line.slice(4))}</h3>);
    } else if (line.startsWith("> ")) {
      nodes.push(<blockquote key={index} className="border-l-2 border-[#171717] pl-3 text-[#555]">{inlineMarkdown(line.slice(2))}</blockquote>);
    } else if (line.trim()) {
      nodes.push(<p key={index}>{inlineMarkdown(line)}</p>);
    } else {
      nodes.push(<div key={index} className="h-2" />);
    }
  });
  flushList(lines.length);
  flushCode(lines.length);
  return nodes;
}

function inlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-[#ececec] px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>;
    }
    return <span key={index}>{part}</span>;
  });
}
