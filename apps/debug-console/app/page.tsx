"use client";

import { useCallback, useEffect, useState } from "react";
import { log } from "@/lib/debug-bus";
import { apiRequest, CORE_API_URL } from "@/lib/api-client";
import { MARKET_WS_URL } from "@/lib/ws-client";
import { Panel, Shell } from "@/components/ui/shell";
import Terminal from "@/components/ui/terminal";
import { formatIstTime } from "@/lib/time";

const HEALTH_CHECKS = [
    ["core-backend", "API process"],
    ["market-engine", "matching and risk engine"],
    ["redis-stream", "Redis event streams"],
    ["nats-stream", "NATS request bus"],
    ["ws-engine", "market-data WebSocket"],
    ["ws-market-poller", "index-price poller"],
    ["database-engine", "database projection worker"],
    ["postgres", "PostgreSQL"],
    ["core-frontend", "trading frontend"],
    ["docs-frontend", "API documentation"],
    ["debug-frontend", "this console"],
] as const;

type HealthResult = {
    status: "checking" | "up" | "down";
    message: string;
    latency: number;
    checkedAt: string;
};

export default function HomePage() {
    const [health, setHealth] = useState<Record<string, HealthResult>>({});
    const [refreshing, setRefreshing] = useState(false);

    const refreshHealth = useCallback(async () => {
        setRefreshing(true);
        setHealth((current) => Object.fromEntries(HEALTH_CHECKS.map(([name]) => [name, current[name] ?? {
            status: "checking",
            message: "request pending",
            latency: 0,
            checkedAt: "—",
        }])));

        const results = await Promise.all(HEALTH_CHECKS.map(async ([name]) => {
            try {
                const result = await apiRequest<{ success?: boolean; message?: string }>("GET", `/health/${name}`, undefined, { auth: "none" });
                const value: HealthResult = {
                    status: result.data.success === false ? "down" : "up",
                    message: result.data.message ?? "healthy",
                    latency: result.latencyMs,
                    checkedAt: formatIstTime(),
                };
                log(value.status === "up" ? "OK" : "ERROR", `health.${name}`, `${value.message} (${value.latency}ms)`);
                return [name, value] as const;
            } catch (error) {
                const value: HealthResult = {
                    status: "down",
                    message: error instanceof Error ? error.message : String(error),
                    latency: 0,
                    checkedAt: formatIstTime(),
                };
                log("ERROR", `health.${name}`, value.message);
                return [name, value] as const;
            }
        }));

        setHealth(Object.fromEntries(results));
        setRefreshing(false);
    }, []);

    useEffect(() => {
        log("INFO", "boot", `core_api=${CORE_API_URL}`);
        log("INFO", "boot", `market_ws=${MARKET_WS_URL}`);
        const initialTimer = window.setTimeout(() => void refreshHealth(), 0);
        const timer = window.setInterval(() => void refreshHealth(), 30_000);
        return () => {
            window.clearTimeout(initialTimer);
            window.clearInterval(timer);
        };
    }, [refreshHealth]);

    const up = Object.values(health).filter((result) => result.status === "up").length;
    const down = Object.values(health).filter((result) => result.status === "down").length;

    return (
        <Shell title="home">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1fr_1fr]">
                <div className="flex min-h-0 flex-col gap-px bg-border h-full">
                    <Panel title="system.overview">
                        <div className="grid grid-cols-[1fr_auto] gap-4 p-3 text-[12px]">
                            <div>
                                <pre className="text-term-dim">{`
 ████████╗██████╗ ██████╗
 ╚══██╔══╝██╔══██╗██╔══██╗
    ██║   ██████╔╝██║  ██║   trading-engine v0.1.0-dev
    ██║   ██╔══██╗██║  ██║   simulated debug surface
    ██║   ██║  ██║██████╔╝   build a3f1c · ${new Date().getFullYear()}
    ╚═╝   ╚═╝  ╚═╝╚═════╝
`}</pre>
                                <pre className="text-term-dim">{` CEX DEBUG CONSOLE
 ├─ http  ${CORE_API_URL}
 └─ ws    ${MARKET_WS_URL}`}</pre>
                                <p className="mt-3 text-foreground">Every page calls the core-backend routes directly. Market and trade views merge HTTP snapshots with live WebSocket frames.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-px bg-border self-start border border-border text-center">
                                <Summary label="up" value={String(up)} className="text-term-green" />
                                <Summary label="down" value={String(down)} className="text-term-red" />
                            </div>
                        </div>
                    </Panel>

                    <Panel title="health.routes · /api/v1/health/*" right={<button onClick={() => void refreshHealth()} disabled={refreshing} className="hover:text-term-green disabled:opacity-50">[{refreshing ? "checking" : "refresh"}]</button>}>
                        <table className="w-full text-[12px]"><tbody>{HEALTH_CHECKS.map(([name, description]) => {
                            const result = health[name];
                            const status = result?.status ?? "checking";
                            return <tr key={name} className="border-b border-border"><td className="px-3 py-1 text-foreground">{name}</td><td className="px-3 py-1 text-term-dim">{description}</td><td className={`px-3 py-1 ${status === "up" ? "text-term-green" : status === "down" ? "text-term-red" : "text-term-yellow"}`}>● {status.toUpperCase()}</td><td className="px-3 py-1 text-right text-term-dim">{result?.latency ?? 0}ms · {result?.checkedAt ?? "—"}</td></tr>;
                        })}</tbody></table>
                    </Panel>

                    <Panel title="modules">
                        <ul className="divide-y divide-border text-[12px]">{[
                            ["/signup", "auth.signup", "POST /auth/signup"],
                            ["/signin", "auth.signin", "POST /auth/signin + bearer storage"],
                            ["/wallet", "wallet.*", "balance, on-ramp, withdrawal"],
                            ["/market", "market.*", "catalog, ticker, depth, snapshot, ws"],
                            ["/trade", "order.*", "spot, perp, reduce-only, cancel"],
                        ].map(([href, name, description]) => <li key={href} className="flex items-center gap-3 px-3 py-1.5"><a href={href} className="text-term-green hover:underline">{name}</a><span className="text-term-dim">{description}</span><span className="ml-auto text-term-dim">{href}</span></li>)}</ul>
                    </Panel>
                </div>
                <Terminal title="stdout · health.monitor" />
            </main>
        </Shell>
    );
}

function Summary({ label, value, className }: { label: string; value: string; className: string }) {
    return <div className="bg-card p-3"><div className="text-[10px] uppercase text-term-dim">{label}</div><div className={`text-2xl ${className}`}>{value}</div></div>;
}
