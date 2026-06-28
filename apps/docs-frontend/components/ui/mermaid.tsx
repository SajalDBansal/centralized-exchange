import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;
function init() {
    if (initialized) return;
    mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        themeVariables: {
            background: "#0a0d12",
            primaryColor: "#1a2030",
            primaryTextColor: "#d8f0d8",
            primaryBorderColor: "#3a8a4a",
            lineColor: "#4ea66a",
            secondaryColor: "#1f2937",
            tertiaryColor: "#0f1419",
        },
    });
    initialized = true;
}

export function Mermaid({ code }: { code: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>("");
    const [err, setErr] = useState<string>("");

    useEffect(() => {
        init();
        const id = "m" + Math.random().toString(36).slice(2);
        mermaid
            .render(id, code)
            .then(({ svg }) => setSvg(svg))
            .catch((e) => setErr(String(e?.message ?? e)));
    }, [code]);

    if (err) {
        return (
            <pre className="panel p-3 text-terminal-red text-xs overflow-x-auto">
                mermaid error: {err}
            </pre>
        );
    }
    return (
        <div
            ref={ref}
            className="panel my-4 flex justify-center overflow-x-auto p-4"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
