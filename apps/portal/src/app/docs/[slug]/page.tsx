import fs from "node:fs";
import path from "node:path";
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ArrowLeft, ArrowRight } from "lucide-react";

interface DocsPageProps {
  params: Promise<{ slug: string }>;
}

const AVAILABLE_SLUGS: Record<string, { title: string; category: string }> = {
  "gate-integration": { title: "Client Access Gate Integration", category: "Integration" },
  "analytics-tracker": { title: "Cookieless Analytics & Offload", category: "Analytics" },
  embeds: { title: "Embeddable Widgets & Web Components", category: "Embeds" },
  webhooks: { title: "Webhooks & Event Delivery", category: "Automation" },
  "sdk-reference": { title: "TypeScript SDK Reference (@rapidshift/sdk)", category: "SDK" },
  "architecture-ddd": { title: "Architecture & Domain-Driven Design", category: "Architecture" },
};

export async function generateStaticParams() {
  return Object.keys(AVAILABLE_SLUGS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocsPageProps) {
  const { slug } = await params;
  const guide = AVAILABLE_SLUGS[slug];
  if (!guide) return { title: "Not Found" };
  return {
    title: `${guide.title} | RapidShift Documentation`,
    description: `Documentation and integration guide for ${guide.title}`,
  };
}

export default async function GuideDetailPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const guide = AVAILABLE_SLUGS[slug];
  if (!guide) notFound();

  // Load guide markdown file from docs/guides/
  const guidesDir = path.resolve(process.cwd(), "../../docs/guides");
  const fallbackDir = path.resolve(process.cwd(), "docs/guides");
  let filePath = path.join(guidesDir, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(fallbackDir, `${slug}.md`);
  }

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const rawMarkdown = await fs.promises.readFile(filePath, "utf-8");

  return (
    <div className="w-full py-10 px-4 sm:px-6 lg:px-8 xl:px-10">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Left Sidebar Navigation */}
        <aside className="lg:col-span-1 space-y-6">
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>

          <div className="space-y-2 border-t border-border/40 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Integration Guides
            </h4>
            <nav className="space-y-1">
              {Object.entries(AVAILABLE_SLUGS).map(([s, meta]) => {
                const isActive = s === slug;
                return (
                  <Link
                    key={s}
                    href={`/docs/${s}`}
                    className={`block px-3 py-2 text-xs rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {meta.title}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <BookOpen className="w-4 h-4" />
              <span>Interactive API</span>
            </div>
            <p className="text-muted-foreground">
              Looking for request and response schemas for public endpoints?
            </p>
            <Link
              href="/docs/api"
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <span>Explore Scalar Reference</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </aside>

        {/* Main Document Content */}
        <main className="lg:col-span-3 space-y-6">
          <div className="space-y-2 border-b border-border/40 pb-4">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-muted text-muted-foreground">
              <span>{guide.category}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{guide.title}</h1>
          </div>

          <article className="prose prose-invert max-w-none space-y-6 text-sm sm:text-base leading-relaxed text-foreground/90">
            {renderMarkdownContent(rawMarkdown)}
          </article>
        </main>
      </div>
    </div>
  );
}

/**
 * Server-rendered structured markdown processor.
 * Transforms headers, codeblocks, tables, blockquotes, and lists into React components.
 */
function renderMarkdownContent(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let index = 0;

  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLanguage = "";

  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (inTable && tableHeader.length > 0) {
      elements.push(
        <div key={`table-${index}`} className="my-6 overflow-x-auto border border-border/50 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 font-semibold border-b border-border/40">
              <tr>
                {tableHeader.map((h, i) => (
                  <th key={i} className="px-4 py-2.5">
                    {h.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/20">
                  {row.map((col, cIdx) => (
                    <td key={cIdx} className="px-4 py-2 text-muted-foreground">
                      {col.trim()}
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
      flushTable();
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${index}`} className="my-4 rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
            {codeLanguage && (
              <div className="px-4 py-1.5 border-b border-border/40 bg-muted/60 text-[11px] font-mono font-medium text-muted-foreground">
                {codeLanguage}
              </div>
            )}
            <pre className="p-4 overflow-x-auto font-mono text-xs leading-normal">
              <code>{codeBuffer.join("\n")}</code>
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

    // Tables (starts with |)
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cols = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      // Separator row (e.g. |---|---|)
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

    // Horizontal Rule
    if (line.trim() === "---") {
      elements.push(<hr key={`hr-${index}`} className="my-8 border-border/40" />);
      index++;
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      // Main title already rendered at top
      index++;
      continue;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${index}`} className="text-2xl font-bold tracking-tight mt-8 mb-4 border-b border-border/30 pb-2">
          {line.slice(3)}
        </h2>
      );
      index++;
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${index}`} className="text-lg font-semibold tracking-tight mt-6 mb-2">
          {line.slice(4)}
        </h3>
      );
      index++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={`quote-${index}`}
          className="my-4 border-l-4 border-primary pl-4 py-1 italic text-muted-foreground text-xs sm:text-sm bg-primary/5 rounded-r"
        >
          {line.slice(2)}
        </blockquote>
      );
      index++;
      continue;
    }

    // Lists
    if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={`li-${index}`} className="ml-4 list-disc text-muted-foreground my-1">
          {line.slice(2)}
        </li>
      );
      index++;
      continue;
    }

    // Standard Paragraph
    if (line.trim().length > 0) {
      elements.push(
        <p key={`p-${index}`} className="my-3 text-muted-foreground leading-relaxed">
          {line}
        </p>
      );
    }

    index++;
  }

  flushTable();
  return elements;
}
