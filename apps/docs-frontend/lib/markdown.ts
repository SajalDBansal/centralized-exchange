export function extractHeadings(markdown: string) {
    const headings: { level: number; text: string; id: string }[] = [];
    let inCodeBlock = false;

    for (const line of markdown.split("\n")) {
        if (line.startsWith("```")) inCodeBlock = !inCodeBlock;
        if (inCodeBlock) continue;

        const match = /^(##|###)\s+(.+?)\s*$/.exec(line);
        if (!match) continue;

        const text = match[2]!.replace(/`/g, "");
        headings.push({
            level: match[1]!.length,
            text,
            id: headingId(text),
        });
    }

    return headings;
}

export function headingId(text: string) {
    return text
        .toLowerCase()
        .replace(/[^\w]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
