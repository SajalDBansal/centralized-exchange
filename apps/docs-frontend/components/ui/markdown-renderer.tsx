"use client";

import dynamic from "next/dynamic";

const Mermaid = dynamic(
    () => import("./mermaid").then((m) => m.Mermaid),
    {
        ssr: false,
    }
);

import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import {
    Info,
    AlertTriangle,
    Lightbulb,
    CheckCircle2,
} from "lucide-react";
import { CodeBlock } from "./code-block";
import { headingId } from "@/lib/markdown";

function getText(node: ReactNode): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number")
        return String(node);

    if (Array.isArray(node))
        return node.map(getText).join("");

    if (isValidElement<{ children?: ReactNode }>(node)) {
        return getText(node.props.children);
    }

    return "";
}

function Callout({
    kind,
    children,
}: {
    kind: "info" | "warning" | "tip" | "success";
    children: ReactNode;
}) {
    const cfg = {
        info: {
            Icon: Info,
            color: "text-terminal-cyan",
            label: "INFO",
        },
        warning: {
            Icon: AlertTriangle,
            color: "text-terminal-amber",
            label: "WARNING",
        },
        tip: {
            Icon: Lightbulb,
            color: "text-terminal-magenta",
            label: "TIP",
        },
        success: {
            Icon: CheckCircle2,
            color: "text-terminal-green",
            label: "SUCCESS",
        },
    }[kind];

    const { Icon } = cfg;

    return (
        <div className="panel my-4">
            <div className="panel-header">
                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                <span className={cfg.color}>{cfg.label}</span>
            </div>

            <div className="p-3 text-sm">{children}</div>
        </div>
    );
}

export default function MarkdownRenderer({
    content,
    hideTitle = false,
}: {
    content: string;
    hideTitle?: boolean;
}) {
    const visibleContent = hideTitle
        ? content.replace(/^#\s+.+?(?:\r?\n)+/, "")
        : content;

    return (
        <div className="md-prose">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                    pre({ children }) {
                        const child = Array.isArray(children)
                            ? children[0]
                            : children;
                        const codeElement = isValidElement<{
                            className?: string;
                            children?: ReactNode;
                        }>(child) ? child : null;

                        const className = codeElement?.props.className ?? "";

                        const raw = getText(codeElement?.props.children).replace(/\n$/, "");

                        if (className.includes("language-mermaid")) {
                            return <Mermaid code={raw} />;
                        }

                        return (
                            <CodeBlock className={className} raw={raw}>
                                {codeElement?.props.children}
                            </CodeBlock>
                        );
                    },

                    blockquote({ children }) {
                        const text = getText(children).trim().toLowerCase();

                        if (
                            text.startsWith("tip:") ||
                            text.startsWith("**tip:")
                        ) {
                            return <Callout kind="tip">{children}</Callout>;
                        }

                        if (
                            text.startsWith("warning:") ||
                            text.startsWith("**warning:")
                        ) {
                            return (
                                <Callout kind="warning">{children}</Callout>
                            );
                        }

                        if (
                            text.startsWith("info:") ||
                            text.startsWith("**info:")
                        ) {
                            return <Callout kind="info">{children}</Callout>;
                        }

                        if (
                            text.startsWith("success:") ||
                            text.startsWith("**success:")
                        ) {
                            return (
                                <Callout kind="success">{children}</Callout>
                            );
                        }

                        return <blockquote>{children}</blockquote>;
                    },

                    h2({ children }) {
                        const id = headingId(getText(children));

                        return <h2 id={id}>{children}</h2>;
                    },

                    h3({ children }) {
                        const id = headingId(getText(children));

                        return <h3 id={id}>{children}</h3>;
                    },

                    a({ href = "", children }) {
                        const external =
                            href.startsWith("http") ||
                            href.startsWith("mailto:") ||
                            href.startsWith("tel:");

                        if (external) {
                            return (
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {children}
                                </a>
                            );
                        }

                        return <Link href={href}>{children}</Link>;
                    },
                }}
            >
                {visibleContent}
            </ReactMarkdown>
        </div>
    );
}
