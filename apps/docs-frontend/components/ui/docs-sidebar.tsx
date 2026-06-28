"use client";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { DocCategorySummary, DocPageSummary } from "@/lib/docs-types";
import { usePathname } from "next/navigation";
import Link from "next/link";

export function DocsSidebar({
    categories,
    allPages,
    onNavigate,
}: {
    categories: DocCategorySummary[];
    allPages: DocPageSummary[];
    onNavigate?: () => void;
}) {
    const pathname = usePathname();
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(categories.map((c) => [c.slug, false])),
    );

    const filtered = useMemo(() => {
        if (!q.trim()) return null;
        const needle = q.toLowerCase();
        return allPages.filter(
            (p) =>
                p.title.toLowerCase().includes(needle) ||
                p.description.toLowerCase().includes(needle) ||
                p.slug.toLowerCase().includes(needle),
        );
    }, [allPages, q]);

    return (
        <nav className="flex h-full flex-col text-sm">
            <div className="border-b border-border p-3">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search docs..."
                        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                {filtered ? (
                    <ul className="space-y-0.5">
                        {filtered.length === 0 && (
                            <li className="px-2 py-2 text-sm text-muted-foreground">No matches</li>
                        )}
                        {filtered.map((p) => (
                            <li key={p.slug}>
                                <Link
                                    href={`/docs/${p.slug}`}
                                    onClick={onNavigate}
                                    className="block rounded-md px-3 py-2 text-sm hover:bg-secondary"
                                >
                                    <span className="text-muted-foreground text-xs">{p.category} / </span>
                                    <span className="text-foreground">{p.title}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    categories.map((cat) => {
                        const isOpen = open[cat.slug];
                        return (
                            <div key={cat.slug} className="mb-3">
                                <button
                                    onClick={() => setOpen((o) => ({ ...o, [cat.slug]: !o[cat.slug] }))}
                                    className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                                >
                                    <ChevronRight
                                        className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
                                    />
                                    {cat.label}
                                </button>
                                {isOpen && (
                                    <ul className="mt-1 space-y-px">
                                        {cat.pages.map((p) => {
                                            const active = pathname === `/docs/${p.slug}`;
                                            return (
                                                <li key={p.slug}>
                                                    <Link
                                                        href={`/docs/${p.slug}`}
                                                        onClick={onNavigate}
                                                        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${active
                                                            ? "bg-primary/10 text-primary font-medium border-l-2 border-primary -ml-px"
                                                            : "text-foreground/70 hover:bg-secondary hover:text-foreground"
                                                            }`}
                                                    >
                                                        <span>{p.title}</span>
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="border-t border-border p-3 text-xs text-muted-foreground">
                {allPages.length} pages · repository docs
            </div>
        </nav>
    );
}
