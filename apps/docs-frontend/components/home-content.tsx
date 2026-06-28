"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Clock,
  Code2,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  Network,
  Rocket,
  Search,
  ServerCog,
  Terminal,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { DocsLayout } from "@/components/ui/docs-layout";
import type {
  DocPageSummary,
  DocsIndexSummary,
} from "@/lib/docs-types";

const categoryIcon: Record<string, typeof BookOpen> = {
  "getting-started": Rocket,
  architecture: Network,
  api: Code2,
  trading: Workflow,
  data: Database,
  operations: ServerCog,
};

const journeys = [
  {
    title: "Trace a perpetual order",
    description: "HTTP validation, Redis, OMS, margin, matching, positions, persistence, and WS fanout.",
    href: "/docs/trading/perpetual-order-workflow",
    icon: Workflow,
  },
  {
    title: "Explore every service",
    description: "Interfaces, dependencies, state ownership, maturity, and operational boundaries.",
    href: "/docs/architecture/services",
    icon: Boxes,
  },
  {
    title: "Integrate end to end",
    description: "Internal exchange traffic, external proxy traffic, Redis, retained NATS, and the data plane.",
    href: "/docs/architecture/integration-flow",
    icon: GitBranch,
  },
] as const;

const DEBUG_URL = process.env.NEXT_PUBLIC_DEBUG_CONSOLE_URL;
const SITE_URL = process.env.NEXT_PUBLIC_CORE_SITE_URL;

export function HomeContent({
  index,
  recent,
}: {
  index: DocsIndexSummary;
  recent: DocPageSummary[];
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    return index.allPages.filter(
      (page) =>
        page.title.toLowerCase().includes(normalizedQuery) ||
        page.description.toLowerCase().includes(normalizedQuery) ||
        page.slug.toLowerCase().includes(normalizedQuery),
    );
  }, [index.allPages, normalizedQuery]);

  return (
    <DocsLayout
      categories={index.categories}
      documentCount={index.allPages.length}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8 lg:py-16">
        <section className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-trading-up)]" />
              Repository-aligned documentation · June 2026
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Understand the <span className="text-primary">CEX</span>, end to end
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              A code-backed guide to the APIs, trading engine, Redis event plane,
              database schema, WebSocket delivery, and operational workflows in this monorepo.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/docs/getting-started/overview"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--color-primary-active)]"
              >
                <Rocket className="h-4 w-4" /> Start here
              </Link>
              <Link
                href="/docs/architecture/overview"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Network className="h-4 w-4" /> System architecture
              </Link>
            </div>

            <div className="mt-8">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search routes, services, flows, and schemas..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {index.allPages.length} docs
                </span>
              </div>
              {normalizedQuery && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-card">
                  {results.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground">
                      No matches for &quot;{query}&quot;
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {results.map((page) => (
                        <li key={page.slug}>
                          <Link
                            href={`/docs/${page.slug}`}
                            className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-secondary"
                          >
                            <span>
                              <span className="text-xs text-muted-foreground">{page.category} / </span>
                              <span className="font-medium text-foreground">{page.title}</span>
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="panel p-6 lg:p-8">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Platform map
            </div>
            <div className="num mt-2 text-5xl font-bold text-primary lg:text-6xl">10</div>
            <div className="mt-1 text-sm text-muted-foreground">application directories documented</div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6">
              <StatTile label="Docs pages" value={String(index.allPages.length)} tone="up" />
              <StatTile label="Shared packages" value="10" />
              <StatTile label="Redis streams" value="2" />
              <StatTile label="WS channels" value="3" />
            </div>
          </div>
        </section>

        <section className="mt-20">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Follow a system journey</h2>
            <p className="mt-1 text-sm text-muted-foreground">The fastest paths through the architecture.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {journeys.map((journey) => {
              const Icon = journey.icon;
              return (
                <Link key={journey.href} href={journey.href} className="panel group p-5 transition-colors hover:border-primary">
                  <div className="flex items-center justify-between">
                    <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{journey.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{journey.description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-16">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Documentation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {index.categories.length} collections · {index.allPages.length} pages
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {index.categories.map((category) => {
              const Icon = categoryIcon[category.slug] ?? BookOpen;
              const first = category.pages[0];

              if (!first) return null;

              return (
                <Link key={category.slug} href={`/docs/${first.slug}`} className="panel group p-5 transition-colors hover:border-primary">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                      <span className="text-base font-semibold text-foreground">{category.label}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {category.pages.length} {category.pages.length === 1 ? "page" : "pages"}
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {category.pages.slice(0, 4).map((page) => (
                      <li key={page.slug} className="text-muted-foreground">
                        <span className="mr-1.5 text-primary">·</span>{page.title}
                      </li>
                    ))}
                  </ul>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="panel lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock className="h-4 w-4 text-primary" /> Recently updated
              </div>
              <span className="text-xs text-muted-foreground">Repository docs</span>
            </div>
            <ul className="divide-y divide-border">
              {recent.map((page) => (
                <li key={page.slug}>
                  <Link href={`/docs/${page.slug}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-secondary">
                    <span className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <span className="text-xs text-muted-foreground">{page.category} / </span>
                        <span className="font-medium text-foreground">{page.title}</span>
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{page.updated}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
              <Activity className="h-4 w-4 text-primary" /> Implementation snapshot
            </div>
            <div className="p-5 text-sm">
              <Row label="Engine transport" value="Redis Streams" tone="ok" />
              <Row label="NATS path" value="Retained" tone="muted" />
              <Row label="Persistence" value="Postgres" tone="ok" />
              <Row label="Realtime" value="3 channels" tone="ok" />
              <Row label="Maturity" value="Development" tone="muted" />
            </div>
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TrustBadge icon={Code2} title="Code-aligned" copy="Routes, event names, enums, and caveats follow the current source." />
          <TrustBadge icon={Zap} title="Diagram-rich" copy="Sequence, data-flow, state, and entity diagrams render inline." />
          <TrustBadge icon={Wrench} title="Easy to maintain" copy="Plain Markdown in packages/docs is the content source of truth." />
        </section>

        <section className="mt-16">
          <div className="panel flex flex-col items-start justify-between gap-4 p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h3 className="text-2xl font-bold tracking-tight text-foreground">See the system running</h3>
              <p className="mt-1 text-sm text-muted-foreground">Use the debug console for the internal API, or open the main market UI.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {DEBUG_URL && (
                <a href={DEBUG_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                  <Terminal className="h-4 w-4" /> Debug console <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {SITE_URL && (
                <a href={SITE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:border-primary hover:text-primary">
                  Exchange UI <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </section>
      </div>
    </DocsLayout>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "up" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${tone === "up" ? "text-[var(--color-trading-up)]" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function TrustBadge({ icon: Icon, title, copy }: { icon: typeof Code2; title: string; copy: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2.5">
        <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "ok" | "muted" }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 ${tone === "ok" ? "text-[var(--color-trading-up)]" : "text-muted-foreground"}`}>
        {tone === "ok" && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-trading-up)]" />}
        {value}
      </span>
    </div>
  );
}
