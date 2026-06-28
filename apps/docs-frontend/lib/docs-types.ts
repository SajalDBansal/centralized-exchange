export type DocType = "readme" | "api" | "architecture";

export type DocPage = {
    slug: string;
    title: string;
    category: string;
    type: DocType;
    updated: string;
    description: string;
    order: number;
    content: string;
};

export type DocPageSummary = Omit<DocPage, "content">;

export type DocCategory = {
    slug: string;
    label: string;
    pages: DocPage[];
};

export type DocCategorySummary = {
    slug: string;
    label: string;
    pages: DocPageSummary[];
};

export type DocsIndex = {
    categories: DocCategory[];
    allPages: DocPage[];
};

export type DocsIndexSummary = {
    categories: DocCategorySummary[];
    allPages: DocPageSummary[];
};
