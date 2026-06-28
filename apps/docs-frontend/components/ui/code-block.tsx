import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({
    className,
    children,
    raw,
}: {
    className?: string;
    children?: ReactNode;
    raw: string;
}) {
    const [copied, setCopied] = useState(false);
    const lang = className?.replace("language-", "") || "text";

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {/* ignore */ }
    };

    return (
        <div className="panel my-4 overflow-hidden">
            <div className="panel-header justify-between">
                <span className="flex items-center gap-2">
                    <span className="text-terminal-green">▸</span>
                    <span>{lang}</span>
                </span>
                <button
                    onClick={onCopy}
                    className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Copy code"
                >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "copied" : "copy"}
                </button>
            </div>
            <pre className={className} style={{ margin: 0, border: 0, borderRadius: 0 }}>
                {children}
            </pre>
        </div>
    );
}
