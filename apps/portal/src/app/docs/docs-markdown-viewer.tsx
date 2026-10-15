"use client";

import React, { useState, useMemo } from "react";
import { Copy, Check, ListTree, Info } from "lucide-react";

interface DocsMarkdownViewerProps {
  markdown: string;
}

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugifyHeading(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Parses inline markdown (`code`, **bold**, [link](href)) into high-contrast React nodes.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Tokenize by inline code `...`, bold **...**, or markdown link [...](...)
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      const codeText = part.slice(1, -1);
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[12px] font-semibold bg-zinc-100 dark:bg-zinc-800/90 text-blue-700 dark:text-blue-300 border border-zinc-200/80 dark:border-zinc-700/70"
        >
          {codeText}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      const boldText = part.slice(2, -2);
      return (
        <strong key={idx} className="font-bold text-zinc-900 dark:text-white">
          {renderInlineMarkdown(boldText)}
        </strong>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          className="font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-4 hover:text-blue-500"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function DocsMarkdownViewer({ markdown }: DocsMarkdownViewerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (code: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const { elements, toc } = useMemo(() => {
    const lines = markdown.split(/\r?\n/);
    const renderedElements: React.ReactNode[] = [];
    const tocItems: TocItem[] = [];
    let index = 0;

    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLanguage = "";

    let inTable = false;
    let tableHeader: string[] = [];
    let tableRows: string[][] = [];

    let listItems: { ordered: boolean; items: string[] } | null = null;

    const flushList = () => {
      if (!listItems || listItems.items.length === 0) return;
      const isOrdered = listItems.ordered;
      const itemsToRender = [...listItems.items];
      listItems = null;

      if (isOrdered) {
        renderedElements.push(
          <ol
            key={`ol-${index}`}
            className="my-4 space-y-2.5 pl-1 list-none"
          >
            {itemsToRender.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm sm:text-[15px] text-zinc-700 dark:text-zinc-300 leading-relaxed"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1">{renderInlineMarkdown(item)}</div>
              </li>
            ))}
          </ol>
        );
      } else {
        renderedElements.push(
          <ul
            key={`ul-${index}`}
            className="my-4 space-y-2 pl-5 list-disc marker:text-blue-600 dark:marker:text-blue-400"
          >
            {itemsToRender.map((item, i) => (
              <li
                key={i}
                className="text-sm sm:text-[15px] text-zinc-700 dark:text-zinc-300 leading-relaxed pl-1"
              >
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ul>
        );
      }
    };

    const flushTable = () => {
      if (inTable && tableHeader.length > 0) {
        renderedElements.push(
          <div
            key={`table-${index}`}
            className="my-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs"
          >
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 font-bold border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  {tableHeader.map((h, i) => (
                    <th key={i} className="px-4 py-3 whitespace-nowrap">
                      {renderInlineMarkdown(h.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                {tableRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {row.map((col, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-4 py-3 text-zinc-700 dark:text-zinc-300 align-top leading-relaxed"
                      >
                        {renderInlineMarkdown(col.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
        tableHeader = [];
        tableRows = [];
      }
    };

    while (index < lines.length) {
      const line = lines[index];

      // Code blocks
      if (line.startsWith("```")) {
        flushList();
        flushTable();
        if (inCodeBlock) {
          const codeContent = codeBuffer.join("\n");
          const blockId = `code-${index}`;
          const langLabel = codeLanguage || "code";
          renderedElements.push(
            <div
              key={blockId}
              className="my-5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 overflow-hidden shadow-sm"
            >
              <div className="px-4 py-2 border-b border-zinc-800/90 bg-zinc-900/90 flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="uppercase tracking-wider text-[11px] font-bold text-blue-400">
                  {langLabel}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(codeContent, blockId)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-sans font-semibold transition cursor-pointer"
                >
                  {copiedId === blockId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto font-mono text-xs sm:text-[13px] leading-relaxed text-zinc-100">
                <code>{codeContent}</code>
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeBuffer = [];
          codeLanguage = "";
        } else {
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
        }
        index++;
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        index++;
        continue;
      }

      // Tables
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        flushList();
        const cols = line
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());

        if (cols.every((c) => /^[-:]+$/.test(c))) {
          index++;
          continue;
        }

        if (!inTable) {
          inTable = true;
          tableHeader = cols;
        } else {
          tableRows.push(cols);
        }
        index++;
        continue;
      } else {
        flushTable();
      }

      // Unordered list item
      if (line.startsWith("- ") || line.startsWith("* ")) {
        if (!listItems || listItems.ordered) {
          flushList();
          listItems = { ordered: false, items: [] };
        }
        listItems.items.push(line.slice(2).trim());
        index++;
        continue;
      }

      // Ordered list item (1. , 2. , etc.)
      const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
      if (orderedMatch) {
        if (!listItems || !listItems.ordered) {
          flushList();
          listItems = { ordered: true, items: [] };
        }
        listItems.items.push(orderedMatch[1].trim());
        index++;
        continue;
      }

      flushList();

      // Horizontal Rule
      if (line.trim() === "---") {
        renderedElements.push(
          <hr
            key={`hr-${index}`}
            className="my-8 border-zinc-200 dark:border-zinc-800"
          />
        );
        index++;
        continue;
      }

      // Top-level H1 (already shown in page header)
      if (line.startsWith("# ")) {
        index++;
        continue;
      }

      // H2
      if (line.startsWith("## ")) {
        const rawHeading = line.slice(3).trim();
        const id = slugifyHeading(rawHeading);
        tocItems.push({ id, text: rawHeading.replace(/`/g, ""), level: 2 });
        renderedElements.push(
          <h2
            id={id}
            key={`h2-${index}`}
            className="scroll-mt-28 text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white mt-10 mb-4 pb-2.5 border-b border-zinc-200 dark:border-zinc-800"
          >
            {renderInlineMarkdown(rawHeading)}
          </h2>
        );
        index++;
        continue;
      }

      // H3
      if (line.startsWith("### ")) {
        const rawHeading = line.slice(4).trim();
        const id = slugifyHeading(rawHeading);
        tocItems.push({ id, text: rawHeading.replace(/`/g, ""), level: 3 });
        renderedElements.push(
          <h3
            id={id}
            key={`h3-${index}`}
            className="scroll-mt-28 text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-7 mb-2.5"
          >
            {renderInlineMarkdown(rawHeading)}
          </h3>
        );
        index++;
        continue;
      }

      // Blockquote / Callout
      if (line.startsWith("> ")) {
        renderedElements.push(
          <div
            key={`quote-${index}`}
            className="my-5 flex items-start gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 text-xs sm:text-sm text-blue-900 dark:text-blue-200 leading-relaxed"
          >
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>{renderInlineMarkdown(line.slice(2).trim())}</div>
          </div>
        );
        index++;
        continue;
      }

      // Standard Paragraph
      if (line.trim().length > 0) {
        renderedElements.push(
          <p
            key={`p-${index}`}
            className="my-3.5 text-sm sm:text-[15px] text-zinc-700 dark:text-zinc-300 leading-7"
          >
            {renderInlineMarkdown(line)}
          </p>
        );
      }

      index++;
    }

    flushList();
    flushTable();
    return { elements: renderedElements, toc: tocItems };
  }, [markdown, copiedId]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
      {/* Main Readable Article Column */}
      <div className="xl:col-span-9 min-w-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs">
        {elements}
      </div>

      {/* Right Sticky Table of Contents */}
      {toc.length > 0 && (
        <aside className="hidden xl:block xl:col-span-3 sticky top-32 space-y-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <ListTree className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>On This Page</span>
          </div>
          <nav className="space-y-1.5 text-xs">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`block py-1 transition-colors hover:text-blue-600 dark:hover:text-blue-400 ${
                  item.level === 3
                    ? "pl-3 text-zinc-500 dark:text-zinc-400 text-[11px]"
                    : "font-semibold text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {item.text}
              </a>
            ))}
          </nav>
        </aside>
      )}
    </div>
  );
}
