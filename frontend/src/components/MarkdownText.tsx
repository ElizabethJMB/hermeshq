import { type JSX } from "react";

function renderMarkdown(text: string): JSX.Element[] {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key++}`} className="my-2 space-y-1 pl-5">
          {listItems.map((item, i) => (
            <li key={`li-${key++}-${i}`} className="list-disc">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushList();
      continue;
    }

    if (trimmed.startsWith("###")) {
      flushList();
      elements.push(
        <h4 key={`h4-${key++}`} className="mt-3 mb-1 font-bold text-[var(--text)]">
          {renderInline(trimmed.replace(/^###\s*/, ""))}
        </h4>,
      );
    } else if (trimmed.startsWith("##")) {
      flushList();
      elements.push(
        <h3 key={`h3-${key++}`} className="mt-3 mb-1 text-base font-bold text-[var(--text)]">
          {renderInline(trimmed.replace(/^##\s*/, ""))}
        </h3>,
      );
    } else if (trimmed.startsWith("#")) {
      flushList();
      elements.push(
        <h3 key={`h3-${key++}`} className="mt-3 mb-1 text-base font-bold text-[var(--text)]">
          {renderInline(trimmed.replace(/^#\s*/, ""))}
        </h3>,
      );
    } else if (/^[-*]\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
    } else if (/^\d+\.\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+\.\s+/, ""));
    } else if (trimmed.startsWith("---")) {
      flushList();
      elements.push(<hr key={`hr-${key++}`} className="my-3 border-[var(--border)]" />);
    } else if (trimmed.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote
          key={`bq-${key++}`}
          className="my-2 border-l-2 border-[var(--accent)] pl-3 italic text-[var(--text-muted)]"
        >
          {renderInline(trimmed.replace(/^>\s*/, ""))}
        </blockquote>,
      );
    } else {
      flushList();
      elements.push(
        <p key={`p-${key++}`} className="my-1">
          {renderInline(trimmed)}
        </p>,
      );
    }
  }
  flushList();

  return elements;
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const bold = remaining.match(/\*\*(.+?)\*\*/);
    const code = remaining.match(/`([^`]+)`/);

    const matches = [
      bold ? { match: bold, type: "bold" as const } : null,
      code ? { match: code, type: "code" as const } : null,
    ].filter(Boolean);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches.sort((a, b) => (a!.match.index! - b!.match.index!))[0]!;
    const idx = first.match.index!;

    if (idx > 0) {
      parts.push(remaining.slice(0, idx));
    }

    if (first.type === "bold") {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold">
          {first.match[1]}
        </strong>,
      );
    } else {
      parts.push(
        <code key={`c-${key++}`} className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">
          {first.match[1]}
        </code>,
      );
    }

    remaining = remaining.slice(idx + first.match[0].length);
  }

  return parts;
}

export function MarkdownText({ children }: { children: string }) {
  return <>{renderMarkdown(children)}</>;
}
