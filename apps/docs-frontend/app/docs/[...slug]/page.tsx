import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronRight, ArrowLeft, ArrowRight, Clock, FileText, Network, Code2 } from "lucide-react";
import Link from "next/link";
import { DocsLayout } from "@/components/ui/docs-layout";
import MarkdownRenderer from "@/components/ui/markdown-renderer";
import { getAdjacent, getDocsIndex, getPage, summarizeDocs } from "@/lib/docs";
import { extractHeadings } from "@/lib/markdown";

const typeMeta = {
    readme: { Icon: FileText, label: "Guide" },
    api: { Icon: Code2, label: "API Reference" },
    architecture: { Icon: Network, label: "Architecture" },
};

type PageProps = {
    params: Promise<{ slug: string[] }>;
};

export function generateStaticParams() {
    return getDocsIndex().allPages.map((page) => ({ slug: page.slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const page = getPage(getDocsIndex(), slug.join("/"));

    if (!page) return {};

    return {
        title: page.title,
        description: page.description,
    };
}

export default async function DocPageView({ params }: PageProps) {
    const { slug: slugParts } = await params;
    const slug = slugParts.join("/");
    const index = getDocsIndex();
    const page = getPage(index, slug);

    if (!page) notFound();

    const summary = summarizeDocs(index);
    const { prev, next } = getAdjacent(index, page.slug);
    const headings = extractHeadings(page.content);
    const Type = typeMeta[page.type];
    const category = summary.categories.find((item) => item.slug === page.category);

    return (
        <DocsLayout categories={summary.categories} documentCount={summary.allPages.length}>
            <div className="mx-auto flex max-w-7xl gap-10 px-4 py-10 lg:px-8">
                <article className="min-w-0 flex-1">
                    <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Link href="/" className="hover:text-primary">Docs</Link>
                        <ChevronRight className="h-3 w-3" />
                        <span>{category?.label ?? page.category}</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-medium text-foreground">{page.title}</span>
                    </nav>

                    <header className="mt-6 border-b border-border pb-6">
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            <Type.Icon className="h-3.5 w-3.5" />
                            {Type.label}
                        </div>
                        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            {page.title}
                        </h1>
                        <p className="mt-2 text-base text-muted-foreground">{page.description}</p>
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" /> Updated {page.updated}
                        </div>
                    </header>

                    <div className="mt-8">
                        <MarkdownRenderer content={page.content} hideTitle />
                    </div>

                    <div className="mt-12 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-2">
                        {prev ? (
                            <Link href={`/docs/${prev.slug}`} className="panel block p-4 hover:border-primary">
                                <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                    <ArrowLeft className="h-3 w-3" /> Previous
                                </div>
                                <div className="mt-1 text-sm font-semibold text-foreground">{prev.title}</div>
                            </Link>
                        ) : <div />}
                        {next ? (
                            <Link href={`/docs/${next.slug}`} className="panel block p-4 text-right hover:border-primary">
                                <div className="flex items-center justify-end gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                    Next <ArrowRight className="h-3 w-3" />
                                </div>
                                <div className="mt-1 text-sm font-semibold text-foreground">{next.title}</div>
                            </Link>
                        ) : <div />}
                    </div>
                </article>

                {headings.length > 0 && (
                    <aside className="hidden w-56 shrink-0 xl:block">
                        <div className="sticky top-20">
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                On this page
                            </div>
                            <ul className="mt-3 space-y-1 border-l border-border text-sm">
                                {headings.map((heading) => (
                                    <li key={heading.id} className={heading.level === 3 ? "pl-4" : ""}>
                                        <a href={`#${heading.id}`} className="-ml-px block border-l border-transparent px-3 py-1 text-muted-foreground hover:border-primary hover:text-primary">
                                            {heading.text}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-6 text-xs text-muted-foreground">
                                {summary.allPages.length} documents in the index
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </DocsLayout>
    );
}
