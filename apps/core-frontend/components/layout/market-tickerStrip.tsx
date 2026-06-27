"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import type { TickerB } from "@workspace/types";
import { fmtPct, fmtPrice } from "@/lib/format";
import { symbolParts } from "@/lib/market-ops";
import { getTickers, highestVolumeMarkets } from "@/utils/http-client";
import { subscribeBatched, tickerFromWs, wsStreams, type TickerWsEvent } from "@/utils/ws-client";

const MAX_TICKERS = 12;

export function TickerStrip() {
    const [tickers, setTickers] = useState<TickerB[]>([]);

    useEffect(() => {
        let cancelled = false;
        getTickers()
            .then((data) => {
                if (!cancelled) setTickers(highestVolumeMarkets(data).slice(0, MAX_TICKERS));
            })
            .catch((error: unknown) => console.error("Failed to load ticker strip", error));
        return () => {
            cancelled = true;
        };
    }, []);

    const symbolsKey = useMemo(() => tickers.map((ticker) => ticker.symbol).join(","), [tickers]);

    useEffect(() => {
        if (!symbolsKey) return;
        const symbols = symbolsKey.split(",");
        return subscribeBatched<TickerWsEvent>(symbols.map(wsStreams.ticker), (events) => {
            const updates = new Map(events.map((event) => [event.s, tickerFromWs(event)]));
            setTickers((current) => current.map((ticker) => updates.get(ticker.symbol) ?? ticker));
        });
    }, [symbolsKey]);

    const loop = [...tickers, ...tickers];

    return (
        <div className="border-b border-border bg-card/40 overflow-hidden min-h-8">
            <div className="flex gap-8 py-2 px-4 animate-[ticker_60s_linear_infinite] whitespace-nowrap">
                {loop.map((ticker, index) => {
                    const change = Number(ticker.priceChangePercent) * 100;
                    return (
                        <Link
                            key={`${ticker.symbol}-${index}`}
                            href={`/trade?symbol=${encodeURIComponent(ticker.symbol)}`}
                            className="flex items-center gap-2 text-xs tabular shrink-0 hover:opacity-80"
                        >
                            <span className="text-muted-foreground font-semibold">{symbolParts(ticker.symbol).display}</span>
                            <span className="font-medium">{fmtPrice(Number(ticker.lastPrice))}</span>
                            <span className={`flex items-center gap-0.5 ${change >= 0 ? "text-up" : "text-down"}`}>
                                {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                {fmtPct(change, false)}
                            </span>
                        </Link>
                    );
                })}
            </div>
            <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
        </div>
    );
}
