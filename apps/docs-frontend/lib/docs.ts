import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
    DocCategory,
    DocPage,
    DocPageSummary,
    DocsIndex,
    DocsIndexSummary,
    DocType,
} from "./docs-types";

const categoryDefinitions = [
    { slug: "getting-started", label: "Getting Started" },
    { slug: "architecture", label: "Architecture" },
    { slug: "api", label: "API Reference" },
    { slug: "trading", label: "Trading Engine" },
    { slug: "data", label: "Data & Persistence" },
    { slug: "operations", label: "Operations" },
] as const;

const categoryRank = new Map<string, number>(
    categoryDefinitions.map((category, index) => [category.slug, index]),
);

export function getDocsIndex(): DocsIndex {
    const docsRoot = resolveDocsRoot();
    const pages = readMarkdownFiles(docsRoot)
        .map((filePath) => parseDoc(filePath, docsRoot))
        .sort(comparePages);
    const pagesByCategory = new Map<string, DocPage[]>();

    for (const page of pages) {
        const categoryPages = pagesByCategory.get(page.category) ?? [];
        categoryPages.push(page);
        pagesByCategory.set(page.category, categoryPages);
    }
    const configuredCategories: DocCategory[] = categoryDefinitions
        .map(({ slug, label }) => ({
            slug,
            label,
            pages: pagesByCategory.get(slug) ?? [],
        }))
        .filter((category) => category.pages.length > 0);
    const knownCategories = new Set(categoryDefinitions.map(({ slug }) => slug));
    const extraCategories = Array.from(pagesByCategory.entries())
        .filter(([slug]) => !knownCategories.has(slug as (typeof categoryDefinitions)[number]["slug"]))
        .map(([slug, categoryPages]) => ({
            slug,
            label: titleCase(slug),
            pages: categoryPages,
        }))
        .sort((left, right) => left.label.localeCompare(right.label));
    const categories = [...configuredCategories, ...extraCategories];

    return {
        categories,
        allPages: categories.flatMap((category) => category.pages),
    };
}

export function summarizeDocs(index: DocsIndex): DocsIndexSummary {
    const categories = index.categories.map((category) => ({
        ...category,
        pages: category.pages.map(summarizePage),
    }));

    return {
        categories,
        allPages: categories.flatMap((category) => category.pages),
    };
}

export function summarizePage(page: DocPage): DocPageSummary {
    return {
        slug: page.slug,
        title: page.title,
        category: page.category,
        type: page.type,
        updated: page.updated,
        description: page.description,
        order: page.order,
    };
}

export function getPage(index: DocsIndex, slug: string): DocPage | undefined {
    return index.allPages.find((page) => page.slug === slug);
}

export function getAdjacent(
    index: DocsIndex,
    slug: string,
): { prev?: DocPage; next?: DocPage } {
    const pageIndex = index.allPages.findIndex((page) => page.slug === slug);

    if (pageIndex === -1) return {};

    return {
        prev: index.allPages[pageIndex - 1],
        next: index.allPages[pageIndex + 1],
    };
}

export function recentlyUpdated(index: DocsIndex, count = 5): DocPage[] {
    return [...index.allPages]
        .sort((left, right) => right.updated.localeCompare(left.updated))
        .slice(0, count);
}

function resolveDocsRoot() {
    const candidates = [
        path.resolve(process.cwd(), "packages/docs"),
        path.resolve(process.cwd(), "../../packages/docs"),
        path.resolve(process.cwd(), "../packages/docs"),
    ];
    const docsRoot = candidates.find((candidate) => existsSync(candidate));

    if (!docsRoot) {
        throw new Error(
            `Could not locate packages/docs. Checked: ${candidates.join(", ")}`,
        );
    }

    return docsRoot;
}

function readMarkdownFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) return readMarkdownFiles(entryPath);
        if (entry.isFile() && entry.name.endsWith(".md")) return [entryPath];

        return [];
    });
}

function parseDoc(filePath: string, docsRoot: string): DocPage {
    const source = readFileSync(filePath, "utf8");
    const { attributes, content } = parseFrontmatter(source, filePath);
    const relativePath = path.relative(docsRoot, filePath).replaceAll(path.sep, "/");
    const category = required(attributes, "category", filePath);
    const type = (attributes.type ?? "readme") as DocType;

    if (type !== "readme" && type !== "api" && type !== "architecture") {
        throw new Error(`Invalid documentation type "${type}" in ${filePath}`);
    }

    return {
        slug: attributes.slug ?? deriveSlug(relativePath, category),
        title: required(attributes, "title", filePath),
        description: required(attributes, "description", filePath),
        category,
        type,
        updated: required(attributes, "updated", filePath),
        order: Number(attributes.order ?? Number.MAX_SAFE_INTEGER),
        content: content.trim(),
    };
}

function parseFrontmatter(source: string, filePath: string) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);

    if (!match) {
        throw new Error(`Missing frontmatter in ${filePath}`);
    }

    const attributes: Record<string, string> = {};

    for (const line of match[1]!.split(/\r?\n/)) {
        const separator = line.indexOf(":");

        if (separator === -1) continue;

        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
        attributes[key] = value;
    }

    return {
        attributes,
        content: source.slice(match[0].length),
    };
}

function required(
    attributes: Record<string, string>,
    key: string,
    filePath: string,
) {
    const value = attributes[key];

    if (!value) throw new Error(`Missing frontmatter field "${key}" in ${filePath}`);

    return value;
}

function deriveSlug(relativePath: string, category: string) {
    const withoutExtension = relativePath.replace(/\.md$/, "");

    if (withoutExtension === "README") return `${category}/overview`;
    if (withoutExtension.endsWith("/README")) {
        return withoutExtension.slice(0, -"/README".length);
    }

    return withoutExtension;
}

function comparePages(left: DocPage, right: DocPage) {
    const categoryDifference =
        (categoryRank.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
        (categoryRank.get(right.category) ?? Number.MAX_SAFE_INTEGER);

    if (categoryDifference !== 0) return categoryDifference;
    if (left.order !== right.order) return left.order - right.order;

    return left.title.localeCompare(right.title);
}

function titleCase(value: string) {
    return value
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
