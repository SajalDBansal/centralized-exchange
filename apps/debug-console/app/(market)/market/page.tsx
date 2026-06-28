"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell, Panel } from "@/components/ui/shell";
import { log } from "@/lib/debug-bus";
import { ResponsePanel, useResponseCapture } from "@/components/ui/response-viewer";
import Terminal from "@/components/ui/terminal";
import { subscribeMarketData, type MarketDataEvent, type WsStatus } from "@/lib/ws-client";
import { formatIstTimeWithMilliseconds } from "@/lib/time";

type Market = {
    id: string;
    name: string;
    baseAsset: { id: string; symbol: string; precision: number };
    quoteAsset: { id: string; symbol: string; precision: number };
    maxLeverage: number;
    minQty: number;
    tickSize: number;
    lotSize: number;
    minNotional: number;
};

type Ticker = {
    lastPrice: string;
    priceChangePercent24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
};

export default function MarketPage() {
    const [markets, setMarkets] = useState<Market[]>([]);
    const [tickers, setTickers] = useState<Record<string, Ticker>>({});
    const [selectedMarket, setSelectedMarket] = useState("");
    const [wsStatus, setWsStatus] = useState<WsStatus>("closed");
    const [lastFrameAt, setLastFrameAt] = useState<string>("—");
    const { history, capture } = useResponseCapture();

    const loadMarkets = useCallback(async () => {
        try {
            const response = await capture<{
                success: boolean;
                data: { markets: Record<string, Market> };
            }>("market.catalog", "GET", "/market", undefined, { auth: "none" });
            const values = Object.values(response.data.markets).sort((a, b) => a.id.localeCompare(b.id));
            setMarkets(values);
            setSelectedMarket((current) => current || values[0]?.id || "");
            log("OK", "market.catalog", `${values.length} engine markets loaded`);

            const tickerResponse = await capture<{
                success: boolean;
                data: { tickers: MarketDataEvent[] };
            }>("market.tickers", "GET", "/market/tickers", undefined, { auth: "none" });
            setTickers(Object.fromEntries(tickerResponse.data.tickers.map((event) => [event.marketId, event.data as unknown as Ticker])));
        } catch {
            // Captured in the response viewer.
        }
    }, [capture]);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadMarkets(), 0);
        return () => window.clearTimeout(timer);
    }, [loadMarkets]);

    useEffect(() => {
        if (markets.length === 0) return;

        return subscribeMarketData({
            marketIds: markets.map((market) => market.id),
            streams: ["ticker", "price"],
            onEvent: (event) => {
                setLastFrameAt(formatIstTimeWithMilliseconds(event.eventTs));
                setTickers((current) => {
                    const previous = current[event.marketId] ?? emptyTicker;
                    if (event.stream === "ticker") {
                        return { ...current, [event.marketId]: { ...previous, ...(event.data as unknown as Ticker) } };
                    }
                    return { ...current, [event.marketId]: { ...previous, lastPrice: String(event.data.lastPrice ?? previous.lastPrice) } };
                });
                log("WS", "market.feed", `${event.type} ${event.marketId} last=${String(event.data.lastPrice ?? "n/a")}`);
            },
            onStatus: (status, detail) => {
                setWsStatus(status);
                log(status === "open" ? "OK" : status === "error" ? "ERROR" : "INFO", "market.ws", `${status} ${detail ?? ""}`);
            },
            onControl: (message) => log("WS", "market.ws", JSON.stringify(message)),
        });
    }, [markets]);

    async function inspect(route: "snapshot" | "depth") {
        if (!selectedMarket) return;
        try {
            await capture(
                `market.${route}`,
                "GET",
                route === "snapshot" ? `/market/${selectedMarket}/snapshot` : `/depth/${selectedMarket}`,
                undefined,
                { auth: "none" },
            );
        } catch {
            // Captured in the response viewer.
        }
    }

    const selected = useMemo(() => markets.find((market) => market.id === selectedMarket), [markets, selectedMarket]);

    return (
        <Shell title="market">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1.5fr_1fr_1fr]">
                <div className="flex min-h-0 flex-col gap-px bg-border">
                    <Panel
                        title={`market.catalog · ${markets.length} symbols`}
                        right={<span className={wsStatus === "open" ? "text-term-green" : wsStatus === "error" ? "text-term-red" : "text-term-yellow"}>● ws={wsStatus} · last={lastFrameAt}</span>}
                    >
                        <table className="w-full text-[12px]">
                            <thead className="sticky top-0 border-b border-border bg-secondary text-left text-[11px] uppercase text-muted-foreground">
                                <tr><th className="px-3 py-1">market</th><th className="px-3 py-1">type</th><th className="px-3 py-1 text-right">last_price</th><th className="px-3 py-1 text-right">24h_change</th><th className="px-3 py-1 text-right">high / low</th><th className="px-3 py-1 text-right">volume</th></tr>
                            </thead>
                            <tbody>{markets.length === 0 ? (
                                <tr><td colSpan={6} className="px-3 py-3 text-term-dim">{"// waiting for GET /api/v1/market"}</td></tr>
                            ) : markets.map((market) => {
                                const ticker = tickers[market.id] ?? emptyTicker;
                                const change = Number(ticker.priceChangePercent24h);
                                return (
                                    <tr key={market.id} onClick={() => setSelectedMarket(market.id)} className={`cursor-pointer border-b border-border hover:bg-accent/40 ${selectedMarket === market.id ? "bg-accent/60" : ""}`}>
                                        <td className="px-3 py-1 text-term-cyan">{market.id}</td>
                                        <td className="px-3 py-1 text-term-dim">{market.id.endsWith("_PERP") ? "PERP" : "SPOT"}</td>
                                        <td className="px-3 py-1 text-right">{ticker.lastPrice}</td>
                                        <td className={`px-3 py-1 text-right ${change >= 0 ? "text-term-green" : "text-term-red"}`}>{change}%</td>
                                        <td className="px-3 py-1 text-right text-term-dim">{ticker.high24h} / {ticker.low24h}</td>
                                        <td className="px-3 py-1 text-right text-term-dim">{ticker.volume24h}</td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </Panel>

                    <Panel
                        title="market.inspect"
                        right={<button onClick={() => void loadMarkets()} className="hover:text-term-green">[reload catalog]</button>}
                    >
                        <div className="grid gap-3 p-3 text-[12px] md:grid-cols-[1fr_auto]">
                            <div>
                                <div className="text-term-dim">selected_market</div>
                                <select value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)} className="w-full border border-border bg-input px-2 py-1 font-mono outline-none focus:border-term-green">
                                    {markets.map((market) => <option key={market.id} value={market.id}>{market.id}</option>)}
                                </select>
                                {selected && <div className="mt-2 text-term-dim">base={selected.baseAsset.id} quote={selected.quoteAsset.id} min_qty={selected.minQty} tick={selected.tickSize} max_leverage={selected.maxLeverage}</div>}
                            </div>
                            <div className="flex items-end gap-2">
                                <button onClick={() => void inspect("snapshot")} className="border border-term-green px-3 py-1 text-term-green">GET snapshot</button>
                                <button onClick={() => void inspect("depth")} className="border border-term-cyan px-3 py-1 text-term-cyan">GET depth</button>
                            </div>
                        </div>
                    </Panel>
                </div>
                <ResponsePanel data={history} title={`market.request_history · ${history.length} calls`} />
                <Terminal title="stdout · market.feed" />
            </main>
        </Shell>
    );
}

const emptyTicker: Ticker = {
    lastPrice: "0",
    priceChangePercent24h: "0",
    high24h: "0",
    low24h: "0",
    volume24h: "0",
};
