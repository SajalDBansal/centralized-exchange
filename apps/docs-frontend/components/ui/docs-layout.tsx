"use client";
import { useState, type ReactNode } from "react";
import { Menu, X, ExternalLink, BookOpen, Code2, Network, Database, Rocket, Workflow } from "lucide-react";
import Link from "next/link";
import { DocsSidebar } from "./docs-sidebar";
import type { DocCategorySummary } from "@/lib/docs-types";

const navLinks = [
    { label: "Docs", href: "/", icon: BookOpen },
    { label: "Architecture", href: "/docs/architecture/overview", icon: Network },
    { label: "API", href: "/docs/api/rest-api", icon: Code2 },
    { label: "Workflows", href: "/docs/trading/perpetual-order-workflow", icon: Workflow },
    { label: "Database", href: "/docs/data/database-schema", icon: Database },
];

const DEBUG_URL = process.env.NEXT_PUBLIC_DEBUG_CONSOLE_URL;
const SITE_URL = process.env.NEXT_PUBLIC_CORE_SITE_URL;

export function DocsLayout({
    children,
    categories,
    documentCount,
}: {
    children: ReactNode;
    categories: DocCategorySummary[];
    documentCount: number;
}) {
    const [open, setOpen] = useState(false);
    const allPages = categories.flatMap((category) => category.pages);

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Top nav — Binance style */}
            <header className="sticky top-0 z-30 border-b border-border bg-background">
                <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-4 lg:px-8">
                    <button
                        className="md:hidden text-foreground"
                        onClick={() => setOpen(true)}
                        aria-label="Open navigation"
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
                        <Rocket className="h-5 w-5 text-primary" />
                        <span className="text-primary">CEX</span>
                        <span className="hidden text-muted-foreground sm:inline text-sm font-medium">/ docs</span>
                    </Link>

                    <nav className="ml-4 hidden items-center gap-1 md:flex">
                        {navLinks.map((l) => {
                            const Icon = l.icon;
                            return (
                                <Link
                                    key={l.label}
                                    href={l.href}
                                    className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary"
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {l.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="ml-auto flex items-center gap-2 text-sm">
                        <a
                            href={DEBUG_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary sm:inline-flex"
                        >
                            Debug Console <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                            href={SITE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--color-primary-active)]"
                        >
                            Exchange <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>
                </div>
            </header>

            <div className="mx-auto flex w-full max-w-[1440px] flex-1">
                <aside className="hidden w-64 shrink-0 border-r border-border md:block">
                    <div className="sticky top-16 h-[calc(100vh-4rem)]">
                        <DocsSidebar categories={categories} allPages={allPages} />
                    </div>
                </aside>

                {open && (
                    <div className="fixed inset-0 z-40 md:hidden">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
                        <div className="absolute inset-y-0 left-0 w-72 border-r border-border bg-background">
                            <div className="flex h-16 items-center justify-between border-b border-border px-4">
                                <span className="text-sm font-semibold">Navigation</span>
                                <button onClick={() => setOpen(false)} aria-label="Close">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="h-[calc(100%-4rem)]">
                                <DocsSidebar
                                    categories={categories}
                                    allPages={allPages}
                                    onNavigate={() => setOpen(false)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <main className="min-w-0 flex-1" data-document-count={documentCount}>{children}</main>
            </div>

        </div>
    );
}
