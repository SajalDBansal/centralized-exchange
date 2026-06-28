"use client";
import { clearLogs, LogLevel, useLogs } from "@/lib/debug-bus";
import { useEffect, useRef } from "react";

const LEVEL_COLOR: Record<LogLevel, string> = {
    INFO: "text-term-cyan",
    DEBUG: "text-term-dim",
    WARN: "text-term-yellow",
    ERROR: "text-term-red",
    OK: "text-term-green",
    WS: "text-term-magenta",
    REQ: "text-term-yellow",
    RES: "text-term-green",
};

export default function Terminal({ title = "debug.console", className = "" }: { title?: string; className?: string }) {
    const logs = useLogs();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [logs]);

    return (
        <div className={`flex h-full min-h-0 flex-col border border-border bg-card ${className}`}>
            <div className="flex items-center justify-between border-b border-border bg-secondary px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span className="inline-block size-2 rounded-full bg-term-green" />
                    <span>{title}</span>
                    <span className="text-term-dim">— {logs.length} lines</span>
                </div>
                <div className="flex gap-3">
                    <button onClick={clearLogs} className="hover:text-term-yellow">[clear]</button>
                </div>
            </div>
            <div ref={ref} className="flex-1 min-h-0 overflow-auto px-2 py-1 text-[12px] leading-snug">
                {logs.length === 0 ? (
                    <div className="text-term-dim">{`// waiting for events...`}</div>
                ) : (
                    logs.map((l) => (
                        <div key={l.id} className="whitespace-pre-wrap break-all">
                            <span className="text-term-dim">{l.ts}</span>{" "}
                            <span className={LEVEL_COLOR[l.level]}>[{l.level.padEnd(5)}]</span>{" "}
                            <span className="text-term-cyan">{l.scope}</span>{" "}
                            <span className="text-foreground">{l.msg}</span>
                        </div>
                    ))
                )}
            </div>
            <div className="border-t border-border bg-secondary px-2 py-1 text-[11px] text-term-dim">
                <span className="text-term-green">$</span> stream --follow --level=debug
            </div>
        </div>
    );
}