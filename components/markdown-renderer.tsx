"use client";

import { useMemo } from "react";
import type { Citation } from "@/lib/sample-data";

interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

export function MarkdownRenderer({
  content,
  citations = [],
  onCitationClick,
}: MarkdownRendererProps) {
  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    citations.forEach((c) => map.set(c.index, c));
    return map;
  }, [citations]);

  const renderedContent = useMemo(() => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLanguage = "";
    let listItems: { level: number; content: string; ordered: boolean }[] = [];

    const flushList = () => {
      if (listItems.length === 0) return null;
      const items = [...listItems];
      listItems = [];
      
      return (
        <ul className="my-4 ml-6 list-disc space-y-2 text-foreground/90">
          {items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineContent(item.content)}
            </li>
          ))}
        </ul>
      );
    };

    const renderInlineContent = (text: string): React.ReactNode => {
      const parts: React.ReactNode[] = [];
      let remaining = text;
      let keyIndex = 0;

      while (remaining.length > 0) {
        // Check for citation references [N] or [N][M]
        const citationMatch = remaining.match(/^\[(\d+)\](?:\[(\d+)\])?(?:\[(\d+)\])?/);
        if (citationMatch) {
          const indices = [citationMatch[1], citationMatch[2], citationMatch[3]]
            .filter(Boolean)
            .map(Number);
          
          parts.push(
            <span key={keyIndex++} className="inline-flex gap-0.5">
              {indices.map((idx) => {
                const citation = citationMap.get(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => citation && onCitationClick?.(citation)}
                    className="citation-link"
                    title={citation?.title || `Citation ${idx}`}
                  >
                    {idx}
                  </button>
                );
              })}
            </span>
          );
          remaining = remaining.slice(citationMatch[0].length);
          continue;
        }

        // Check for bold text **text**
        const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
        if (boldMatch) {
          parts.push(
            <strong key={keyIndex++} className="font-semibold text-foreground">
              {boldMatch[1]}
            </strong>
          );
          remaining = remaining.slice(boldMatch[0].length);
          continue;
        }

        // Check for italic text *text*
        const italicMatch = remaining.match(/^\*(.+?)\*/);
        if (italicMatch) {
          parts.push(
            <em key={keyIndex++} className="italic">
              {italicMatch[1]}
            </em>
          );
          remaining = remaining.slice(italicMatch[0].length);
          continue;
        }

        // Check for inline code `code`
        const codeMatch = remaining.match(/^`(.+?)`/);
        if (codeMatch) {
          parts.push(
            <code
              key={keyIndex++}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground"
            >
              {codeMatch[1]}
            </code>
          );
          remaining = remaining.slice(codeMatch[0].length);
          continue;
        }

        // Check for links [text](url)
        const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          parts.push(
            <a
              key={keyIndex++}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {linkMatch[1]}
            </a>
          );
          remaining = remaining.slice(linkMatch[0].length);
          continue;
        }

        // Regular text - take until next special character
        const nextSpecial = remaining.search(/[\[*`]/);
        if (nextSpecial === -1) {
          parts.push(remaining);
          break;
        } else if (nextSpecial === 0) {
          parts.push(remaining[0]);
          remaining = remaining.slice(1);
        } else {
          parts.push(remaining.slice(0, nextSpecial));
          remaining = remaining.slice(nextSpecial);
        }
      }

      return parts;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle code blocks
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${i}`}
              className="my-4 overflow-x-auto rounded-lg bg-muted p-4"
            >
              <code className="font-mono text-sm text-foreground/90">
                {codeContent.join("\n")}
              </code>
            </pre>
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          const listContent = flushList();
          if (listContent) elements.push(listContent);
          inCodeBlock = true;
          codeLanguage = line.slice(3);
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Handle list items
      const listMatch = line.match(/^(\s*)[-*]\s+(.+)/);
      const orderedListMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
      
      if (listMatch) {
        listItems.push({
          level: listMatch[1].length / 2,
          content: listMatch[2],
          ordered: false,
        });
        continue;
      }
      
      if (orderedListMatch) {
        listItems.push({
          level: orderedListMatch[1].length / 2,
          content: orderedListMatch[2],
          ordered: true,
        });
        continue;
      }

      // Flush pending list before other content
      const listContent = flushList();
      if (listContent) elements.push(listContent);

      // Handle headings
      if (line.startsWith("## ")) {
        elements.push(
          <h2
            key={`h2-${i}`}
            className="mb-4 mt-8 text-2xl font-bold tracking-tight text-foreground first:mt-0"
          >
            {line.slice(3)}
          </h2>
        );
        continue;
      }

      if (line.startsWith("### ")) {
        elements.push(
          <h3
            key={`h3-${i}`}
            className="mb-3 mt-6 text-xl font-semibold tracking-tight text-foreground"
          >
            {line.slice(4)}
          </h3>
        );
        continue;
      }

      if (line.startsWith("#### ")) {
        elements.push(
          <h4
            key={`h4-${i}`}
            className="mb-2 mt-4 text-lg font-semibold text-foreground"
          >
            {line.slice(5)}
          </h4>
        );
        continue;
      }

      // Handle horizontal rule
      if (line.match(/^---+$/)) {
        elements.push(
          <hr key={`hr-${i}`} className="my-8 border-border" />
        );
        continue;
      }

      // Handle blockquotes
      if (line.startsWith("> ")) {
        elements.push(
          <blockquote
            key={`quote-${i}`}
            className="my-4 border-l-4 border-primary/30 pl-4 italic text-muted-foreground"
          >
            {renderInlineContent(line.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Handle empty lines
      if (line.trim() === "") {
        continue;
      }

      // Regular paragraph
      elements.push(
        <p
          key={`p-${i}`}
          className="mb-4 leading-relaxed text-foreground/90"
        >
          {renderInlineContent(line)}
        </p>
      );
    }

    // Flush any remaining list items
    const finalList = flushList();
    if (finalList) elements.push(finalList);

    return elements;
  }, [content, citationMap, onCitationClick]);

  return (
    <article className="prose-research max-w-none">
      {renderedContent}
    </article>
  );
}
