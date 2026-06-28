"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AUTH_CHANGED_EVENT, CORE_API_URL, getAuthSession } from "@/lib/api-client";
import { MARKET_WS_URL } from "@/lib/ws-client";
import { formatIstTime, IST_LABEL } from "@/lib/time";

const NAV = [
    { to: "/", label: "home" },
    { to: "/signin", label: "signin" },
    { to: "/signup", label: "signup" },
    { to: "/wallet", label: "wallet" },
    { to: "/market", label: "market" },
    { to: "/trade", label: "trade" },
] as const;

export function Shell({
    children,
    title,
}: {
    children: ReactNode;
    title: string;
}) {
    const pathname = usePathname();
    const [now, setNow] = useState("");
    const [username, setUsername] = useState<string | null>(null);

    useEffect(() => {
        const tick = () => setNow(formatIstTime());
        tick();
        const i = setInterval(tick, 1000);
        const syncAuth = () => setUsername(getAuthSession()?.user.username ?? null);
        syncAuth();
        window.addEventListener(AUTH_CHANGED_EVENT, syncAuth);
        window.addEventListener("storage", syncAuth);
        return () => {
            clearInterval(i);
            window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth);
            window.removeEventListener("storage", syncAuth);
        };
    }, []);

    return (
        <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
            {/* top bar */}
            <header className="flex items-center justify-between border-b border-border bg-secondary px-3 py-1 text-[12px]">
                <div className="flex items-center gap-4">
                    <span className="text-term-green">●</span>
                    <span className="font-bold tracking-wider">trd-engine</span>
                    <span className="text-term-dim">/{title}</span>
                </div>

                <nav className="flex gap-1">
                    {NAV.map((n) => {
                        const active = pathname === n.to;

                        return (
                            <Link
                                key={n.to}
                                href={n.to}
                                className={`px-2 py-0.5 transition-colors ${active
                                    ? "bg-accent text-term-green border border-border"
                                    : "text-muted-foreground hover:text-term-green"
                                    }`}
                            >
                                {n.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex items-center gap-3 text-term-dim">
                    <span>env=dev</span>
                    <span className={username ? "text-term-green" : "text-term-yellow"}>auth={username ?? "anonymous"}</span>
                    <span className="text-term-green">{IST_LABEL} {now}</span>
                </div>
            </header>

            {children}

            {/* status bar */}
            <footer className="flex items-center justify-between border-t border-border bg-secondary px-3 py-1 text-[11px] text-term-dim">
                <div className="flex gap-4">
                    <span>api={CORE_API_URL}</span>
                    <span>ws={MARKET_WS_URL}</span>
                </div>
                <div className="flex gap-4">
                    <span>market-data.v1 · timezone=Asia/Kolkata</span>
                </div>
            </footer>
        </div>
    );
}

export function Panel({
    title,
    children,
    right,
    className = "",
}: {
    title: string;
    children: ReactNode;
    right?: ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex min-h-0 flex-col border border-border bg-card ${className}`}>
            <div className="flex items-center justify-between border-b border-border bg-secondary px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>{title}</span>
                {right}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </div>
    );
}
