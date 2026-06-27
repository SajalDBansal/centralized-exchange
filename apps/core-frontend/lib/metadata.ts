import type { Metadata } from "next";

type PageMetadataOptions = {
    title: string;
    description: string;
    path: `/${string}` | "/";
    keywords?: string[];
    noIndex?: boolean;
};

export function createPageMetadata({ title, description, path, keywords = [], noIndex = false }: PageMetadataOptions): Metadata {
    return {
        title,
        description,
        keywords,
        alternates: { canonical: path },
        openGraph: {
            title: `${title} | NexaX`,
            description,
            url: path,
            siteName: "NexaX",
            type: "website",
            locale: "en_IN",
        },
        twitter: {
            card: "summary",
            title: `${title} | NexaX`,
            description,
        },
        robots: noIndex
            ? { index: false, follow: false, nocache: true }
            : { index: true, follow: true },
    };
}
