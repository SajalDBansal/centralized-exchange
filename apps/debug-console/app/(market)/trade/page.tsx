"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell, Panel } from "@/components/ui/shell";
import { log } from "@/lib/debug-bus";
import { ResponseViewer, useResponseCapture } from "@/components/ui/response-viewer";
import Terminal from "@/components/ui/terminal";
import { subscribeMarketData, type DepthLevel, type MarketDataEvent, type WsStatus } from "@/lib/ws-client";
import { formatIstMinute, formatIstTime } from "@/lib/time";

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

type TimeInForceValue = "Good_Till_Cancel" | "Immediate_OR_Return" | "Fill_OR_KILL";
type STPMode = "CANCEL_MAKER" | "CANCEL_TAKER" | "CANCEL_BOTH";

type TickerCandle = {
    marketId: string;
    interval: string;
    bucketStart: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    quoteVolume: string;
    tradeCount: number;
    updatedAt: number;
    live?: boolean;
};

type Order = {
    orderId: string;
    marketId: string;
    marketType: "SPOT" | "PERP";
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    position?: "LONG" | "SHORT";
    status: string;
    entryPrice: string;
    quantity: string;
    filled: string;
    remainingQty: string;
    averagePrice: string;
    reduceOnly?: boolean;
    leverage?: number;
    createdAt: number;
};

type Snapshot = {
    marketId: string;
    snapshotAt: number;
    orderbookSeq: number;
    price: { lastPrice: string };
    orderbook: { bids: DepthLevel[]; asks: DepthLevel[] };
};

export default function TradePage() {
    const [markets, setMarkets] = useState<Market[]>([]);
    const [marketId, setMarketId] = useState("BTC_INR");
    const [price, setPrice] = useState("0");
    const [bids, setBids] = useState<DepthLevel[]>([]);
    const [asks, setAsks] = useState<DepthLevel[]>([]);
    const [wsStatus, setWsStatus] = useState<WsStatus>("closed");
    const [side, setSide] = useState<"BUY" | "SELL">("BUY");
    const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
    const [entryPrice, setEntryPrice] = useState("100");
    const [quantity, setQuantity] = useState("1");
    const [leverage, setLeverage] = useState("10");
    const [position, setPosition] = useState<"LONG" | "SHORT">("LONG");
    const [reduceOnly, setReduceOnly] = useState(false);
    const [postOnly, setPostOnly] = useState(false);
    const [stpMode, setStpMode] = useState<STPMode>("CANCEL_TAKER");
    const [timeInForce, setTimeInForce] = useState<TimeInForceValue>("Good_Till_Cancel");
    const [candles, setCandles] = useState<TickerCandle[]>([]);
    const [candlesLoading, setCandlesLoading] = useState(false);
    const [openOrders, setOpenOrders] = useState<Order[]>([]);
    const [orderHistory, setOrderHistory] = useState<Order[]>([]);
    const [frames, setFrames] = useState<MarketDataEvent[]>([]);
    const [busy, setBusy] = useState(false);
    const { history, capture, recordError } = useResponseCapture();

    const selectedMarket = useMemo(() => markets.find((market) => market.id === marketId), [markets, marketId]);
    const marketType: "SPOT" | "PERP" = marketId.endsWith("_PERP") ? "PERP" : "SPOT";

    const loadCatalog = useCallback(async () => {
        try {
            const result = await capture<{ data: { markets: Record<string, Market> } }>("trade.catalog", "GET", "/market", undefined, { auth: "none" });
            const next = Object.values(result.data.markets).sort((a, b) => a.id.localeCompare(b.id));
            setMarkets(next);
            setMarketId((current) => next.some((market) => market.id === current) ? current : next[0]?.id ?? current);
            log("OK", "trade.catalog", `${next.length} markets loaded`);
        } catch (error) {
            log("ERROR", "trade.catalog", error instanceof Error ? error.message : String(error));
        }
    }, [capture]);

    const loadSnapshot = useCallback(async (selectedId: string) => {
        try {
            const response = await capture<{
                success: boolean;
                data: { snapshot: Snapshot };
            }>("trade.snapshot", "GET", `/market/${selectedId}/snapshot`, undefined, { auth: "none" });
            setPrice(response.data.snapshot.price.lastPrice);
            setEntryPrice((current) => response.data.snapshot.price.lastPrice !== "0" ? response.data.snapshot.price.lastPrice : current);
            setBids(response.data.snapshot.orderbook.bids);
            setAsks(response.data.snapshot.orderbook.asks);
            log("OK", "trade.snapshot", `${selectedId} seq=${response.data.snapshot.orderbookSeq}`);
        } catch {
            // Captured in the response viewer.
        }
    }, [capture]);

    const loadCandles = useCallback(async (selectedId: string) => {
        setCandlesLoading(true);
        try {
            const result = await capture<{
                data: { marketId: string; interval: string; candles: TickerCandle[] };
            }>("trade.candles", "GET", `/market/${selectedId}/candles?interval=1m&limit=120`, undefined, { auth: "none" });
            setCandles(result.data.candles);
            log("OK", "trade.chart", `${result.data.candles.length} database candles loaded for ${selectedId}`);
        } catch (error) {
            setCandles([]);
            log("WARN", "trade.chart", error instanceof Error ? error.message : String(error));
        } finally {
            setCandlesLoading(false);
        }
    }, [capture]);

    const refreshOrders = useCallback(async (selectedId: string) => {
        try {
            const [openResult, historyResult] = await Promise.all([
                capture<{ data: { orders: Order[] } }>("trade.open_orders", "GET", `/order/open/${selectedId}`, undefined, { auth: "required" }),
                capture<{ orders: Array<Order & { id?: string }> }>("trade.order_history", "GET", `/order/all/${selectedId}`, undefined, { auth: "required" }),
            ]);
            setOpenOrders(openResult.data.orders ?? []);
            setOrderHistory((historyResult.orders ?? []).map((order) => ({ ...order, orderId: order.orderId ?? order.id ?? "unknown" })));
            log("OK", "trade.orders", `open=${openResult.data.orders?.length ?? 0} history=${historyResult.orders?.length ?? 0}`);
        } catch (error) {
            log("WARN", "trade.orders", error instanceof Error ? error.message : String(error));
        }
    }, [capture]);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadCatalog(), 0);
        return () => window.clearTimeout(timer);
    }, [loadCatalog]);

    useEffect(() => {
        if (!marketId) return;
        const timer = window.setTimeout(() => {
            void loadSnapshot(marketId);
            void loadCandles(marketId);
            void refreshOrders(marketId);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadCandles, loadSnapshot, marketId, refreshOrders]);

    useEffect(() => {
        if (!marketId) return;

        return subscribeMarketData({
            marketIds: [marketId],
            onEvent: (event) => {
                setFrames((current) => [event, ...current].slice(0, 30));
                if (event.stream === "depth") {
                    setBids(event.data.bids ?? []);
                    setAsks(event.data.asks ?? []);
                } else if (event.data.lastPrice !== undefined) {
                    setPrice(String(event.data.lastPrice));
                }
                if (event.stream === "ticker" && event.data.lastPrice !== undefined) {
                    setCandles((current) => mergeTickerUpdate(current, event));
                }
                log("WS", "trade.feed", `${event.type} ${event.marketId} seq=${event.seq ?? "-"}`);
            },
            onStatus: (status, detail) => {
                setWsStatus(status);
                log(status === "open" ? "OK" : status === "error" ? "ERROR" : "INFO", "trade.ws", `${status} ${detail ?? ""}`);
            },
            onControl: (message) => log("WS", "trade.ws", JSON.stringify(message)),
        });
    }, [marketId]);

    async function placeOrder(e: React.FormEvent) {
        e.preventDefault();
        const effectivePrice = orderType === "MARKET" ? (price === "0" ? entryPrice : price) : entryPrice;
        const effectiveTif: TimeInForceValue = orderType === "MARKET" ? "Immediate_OR_Return" : timeInForce;
        const numericQuantity = Number(quantity);
        const numericLeverage = Number(leverage);

        if (!Number.isFinite(numericQuantity) || numericQuantity <= 0 || Number(effectivePrice) <= 0) {
            recordError("POST", "/order", { marketId, entryPrice: effectivePrice, quantity }, {
                success: false,
                type: "VALIDATION_ERROR",
                message: "quantity and entry price must be greater than zero",
            });
            return;
        }

        if (marketType === "PERP" && (!Number.isInteger(numericLeverage) || numericLeverage < 1 || numericLeverage > (selectedMarket?.maxLeverage ?? 1))) {
            recordError("POST", "/order", { marketId, leverage }, {
                success: false,
                type: "VALIDATION_ERROR",
                message: `leverage must be an integer between 1 and ${selectedMarket?.maxLeverage ?? 1}`,
            });
            return;
        }

        const payload = {
            marketId,
            entryPrice: effectivePrice,
            quantity,
            leverage: marketType === "PERP" ? numericLeverage : 1,
            side,
            marketType,
            type: orderType,
            ...(marketType === "PERP" ? { position } : {}),
            postOnly: orderType === "LIMIT" && postOnly,
            reduceOnly: marketType === "PERP" && reduceOnly,
            stpMode,
            timeInForce: effectiveTif,
        };

        setBusy(true);
        try {
            const response = await capture<{
                success: boolean;
                message: string;
                order: { data?: { order?: Order }; code?: string };
            }>("trade.order", "POST", "/order", payload, { auth: "required" });
            const order = response.order.data?.order;
            log("OK", "trade.order", `${response.message}${order ? ` id=${order.orderId} status=${order.status}` : ""}`);
            await Promise.all([loadSnapshot(marketId), refreshOrders(marketId)]);
        } catch {
            // Captured in the response viewer.
        } finally {
            setBusy(false);
        }
    }

    async function cancelOrder(orderId: string) {
        setBusy(true);
        try {
            await capture("trade.cancel", "DELETE", `/order/${orderId}`, undefined, { auth: "required" });
            log("OK", "trade.cancel", `order=${orderId} canceled; reserved balance released`);
            await Promise.all([loadSnapshot(marketId), refreshOrders(marketId)]);
        } catch {
            // Captured in the response viewer.
        } finally {
            setBusy(false);
        }
    }

    function prepareClose() {
        if (marketType !== "PERP") return;
        setReduceOnly(true);
        setOrderType("MARKET");
        setTimeInForce("Immediate_OR_Return");
        log("INFO", "trade.position", "close prepared: choose the opposite side, set size, then submit reduce-only MARKET IOC");
    }

    return (
        <Shell title="trade">
            <main className="flex-1 overflow-auto bg-border">
                <div className="flex flex-col gap-px">
                    <Panel
                        title={`ticker.chart · ${marketId} · 1m · postgres + websocket`}
                        className="h-[310px] shrink-0"
                        right={<span className="text-[10px] text-term-dim">db={candles.filter((candle) => !candle.live).length} · live={candles.filter((candle) => candle.live).length}</span>}
                    >
                        <TickerChart candles={candles} loading={candlesLoading} quoteAsset={selectedMarket?.quoteAsset.id ?? "quote"} />
                    </Panel>

                    <div className="grid grid-cols-12 gap-px" style={{ minHeight: 300 }}>
                        <Panel title={`market · ${marketId} · last=${price}`} className="col-span-12 lg:col-span-5" right={<span className={wsStatus === "open" ? "text-term-green" : "text-term-yellow"}>● ws={wsStatus}</span>}>
                            <div className="grid gap-3 p-3 text-[12px]">
                                <label><span className="text-term-dim">market_id</span><select value={marketId} onChange={(e) => { setFrames([]); setCandles([]); setMarketId(e.target.value); }} className={inputCls}>{markets.map((market) => <option key={market.id} value={market.id}>{market.id}</option>)}</select></label>
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                    <Metric label="type" value={marketType} />
                                    <Metric label="base" value={selectedMarket?.baseAsset.id ?? "—"} />
                                    <Metric label="quote" value={selectedMarket?.quoteAsset.id ?? "—"} />
                                    <Metric label="max leverage" value={String(selectedMarket?.maxLeverage ?? "—")} />
                                </div>
                                <div className="border border-border bg-secondary p-2 text-term-dim">
                                    HTTP snapshot seeds the book; ticker, price, and depth frames then update it live. Frames received: <span className="text-term-magenta">{frames.length}</span>
                                </div>
                            </div>
                        </Panel>
                        <Panel title="orderbook · engine L2" className="col-span-12 md:col-span-6 lg:col-span-4">
                            <OrderBook bids={bids} asks={asks} />
                        </Panel>
                        <Panel title="websocket.frames" className="col-span-12 md:col-span-6 lg:col-span-3">
                            <div className="divide-y divide-border text-[11px]">{frames.length === 0 ? <div className="p-3 text-term-dim">{"// waiting for market-data.v1"}</div> : frames.map((frame, index) => (
                                <div key={`${frame.eventTs}-${frame.stream}-${index}`} className="grid grid-cols-[auto_1fr_auto] gap-2 px-2 py-1"><span className="text-term-magenta">{frame.stream}</span><span className="truncate">{frame.type}</span><span className="text-term-dim">{formatIstTime(frame.eventTs)}</span></div>
                            ))}</div>
                        </Panel>
                    </div>

                    <div className="grid h-[960px] min-h-0 grid-cols-12 grid-rows-3 gap-px overflow-hidden md:h-[700px] md:grid-rows-2 lg:h-[440px] lg:grid-rows-1">
                        <Panel title="order.create · complete backend payload" className="col-span-12 min-h-0 overflow-hidden lg:col-span-4">
                            <form onSubmit={placeOrder} className="grid grid-cols-2 gap-2 p-3 text-[12px]">
                                <Choice values={["BUY", "SELL"] as const} value={side} onChange={(value) => { setSide(value); setPosition(value === "BUY" ? "LONG" : "SHORT"); }} />
                                <Choice values={["LIMIT", "MARKET"] as const} value={orderType} onChange={(value) => { setOrderType(value); if (value === "MARKET") setTimeInForce("Immediate_OR_Return"); }} />
                                <label><span className="text-term-dim">market_id</span><input value={marketId} disabled className={inputCls} /></label>
                                <label><span className="text-term-dim">market_type</span><input value={marketType} disabled className={inputCls} /></label>
                                <label><span className="text-term-dim">entry_price</span><input value={orderType === "MARKET" && price !== "0" ? price : entryPrice} onChange={(e) => setEntryPrice(e.target.value)} disabled={orderType === "MARKET"} className={inputCls} /></label>
                                <label><span className="text-term-dim">quantity ({selectedMarket?.baseAsset.id ?? "base"})</span><input value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} /></label>
                                <label><span className="text-term-dim">leverage</span><input value={marketType === "PERP" ? leverage : "1"} onChange={(e) => setLeverage(e.target.value)} disabled={marketType !== "PERP"} className={inputCls} /></label>
                                <label><span className="text-term-dim">position</span><select value={position} disabled={marketType !== "PERP"} onChange={(e) => setPosition(e.target.value as "LONG" | "SHORT")} className={inputCls}><option value="LONG">LONG</option><option value="SHORT">SHORT</option></select></label>
                                <label><span className="text-term-dim">time_in_force</span><select value={orderType === "MARKET" ? "Immediate_OR_Return" : timeInForce} disabled={orderType === "MARKET"} onChange={(e) => setTimeInForce(e.target.value as TimeInForceValue)} className={inputCls}>{TIF_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                                <label><span className="text-term-dim">stp_mode</span><select value={stpMode} onChange={(e) => setStpMode(e.target.value as STPMode)} className={inputCls}><option value="CANCEL_TAKER">CANCEL_TAKER</option><option value="CANCEL_MAKER">CANCEL_MAKER</option><option value="CANCEL_BOTH">CANCEL_BOTH</option></select></label>
                                <label className="flex items-center gap-2"><input type="checkbox" checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} disabled={orderType === "MARKET"} /> post_only</label>
                                <label className="flex items-center gap-2"><input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} disabled={marketType !== "PERP"} /> reduce_only</label>
                                <div className="col-span-2 border border-border bg-secondary px-2 py-1 text-term-dim">
                                    min_qty={selectedMarket?.minQty ?? "—"} · tick={selectedMarket?.tickSize ?? "—"} · lot={selectedMarket?.lotSize ?? "—"} · min_notional={selectedMarket?.minNotional ?? "—"}
                                </div>
                                <div className="col-span-2 flex gap-2">
                                    <button disabled={busy} className={`flex-1 border px-2 py-1 disabled:opacity-50 ${side === "BUY" ? "border-term-green text-term-green" : "border-term-red text-term-red"}`}>{busy ? "submitting..." : `$ ./submit --${side.toLowerCase()}`}</button>
                                    <button type="button" onClick={prepareClose} disabled={marketType !== "PERP"} className="border border-term-yellow px-2 py-1 text-term-yellow disabled:opacity-30">[prepare close]</button>
                                </div>
                            </form>
                        </Panel>
                        <Panel title={`request.response_history · ${history.length} calls`} className="col-span-12 min-h-0 overflow-hidden md:col-span-6 lg:col-span-4"><ResponseViewer data={history} /></Panel>
                        <div className="col-span-12 flex min-h-0 overflow-hidden md:col-span-6 lg:col-span-4">
                            <Terminal title="stdout · trade.engine" className="w-full" />
                        </div>
                    </div>

                    <div className="grid grid-cols-12 gap-px" style={{ minHeight: 240 }}>
                        <Panel title={`open.orders · ${marketId}`} className="col-span-12 lg:col-span-7"><OrderTable rows={openOrders} onCancel={(id) => void cancelOrder(id)} /></Panel>
                        <Panel title="order.history · postgres projection" className="col-span-12 lg:col-span-5"><OrderTable rows={orderHistory} /></Panel>
                    </div>
                </div>
            </main>
        </Shell>
    );
}

const inputCls = "w-full border border-border bg-input px-2 py-1 font-mono text-foreground outline-none focus:border-term-green disabled:opacity-50";
const TIF_OPTIONS: Array<{ label: string; value: TimeInForceValue }> = [
    { label: "GTC · Good Till Cancel", value: "Good_Till_Cancel" },
    { label: "IOC · Immediate Or Return", value: "Immediate_OR_Return" },
    { label: "FOK · Fill Or Kill", value: "Fill_OR_KILL" },
];

function Choice<T extends string>({ values, value, onChange }: { values: readonly T[]; value: T; onChange: (value: T) => void }) {
    return <div className="col-span-2 flex gap-1">{values.map((candidate) => <button key={candidate} type="button" onClick={() => onChange(candidate)} className={`flex-1 border px-2 py-1 ${value === candidate ? "border-term-cyan text-term-cyan" : "border-border text-term-dim"}`}>{candidate}</button>)}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
    return <div className="border border-border bg-secondary p-2"><div className="text-[10px] uppercase text-term-dim">{label}</div><div className="text-term-cyan">{value}</div></div>;
}

function mergeTickerUpdate(current: TickerCandle[], event: MarketDataEvent): TickerCandle[] {
    const price = Number(event.data.lastPrice);
    if (!Number.isFinite(price) || price <= 0) return current;

    const bucketStart = Math.floor(event.eventTs / 60_000) * 60_000;
    const last = current[current.length - 1];
    const lastQuantity = Number(event.data.lastQuantity ?? 0);
    const safeQuantity = Number.isFinite(lastQuantity) && lastQuantity > 0 ? lastQuantity : 0;

    if (last?.bucketStart === bucketStart) {
        const updated: TickerCandle = {
            ...last,
            high: String(Math.max(Number(last.high), price)),
            low: String(Math.min(Number(last.low), price)),
            close: String(price),
            volume: String(Number(last.volume) + safeQuantity),
            tradeCount: last.tradeCount + 1,
            updatedAt: event.eventTs,
            live: true,
        };
        return [...current.slice(0, -1), updated];
    }

    return [...current, {
        marketId: event.marketId,
        interval: "1m",
        bucketStart,
        open: String(price),
        high: String(price),
        low: String(price),
        close: String(price),
        volume: String(safeQuantity),
        quoteVolume: String(safeQuantity * price),
        tradeCount: 1,
        updatedAt: event.eventTs,
        live: true,
    }].slice(-120);
}

function TickerChart({ candles, loading, quoteAsset }: { candles: TickerCandle[]; loading: boolean; quoteAsset: string }) {
    const values = candles
        .map((candle) => ({
            ...candle,
            openValue: Number(candle.open),
            highValue: Number(candle.high),
            lowValue: Number(candle.low),
            closeValue: Number(candle.close),
        }))
        .filter((candle) => [candle.openValue, candle.highValue, candle.lowValue, candle.closeValue].every(Number.isFinite));

    if (loading && values.length === 0) {
        return <div className="grid h-full place-items-center text-[12px] text-term-dim">$ loading ticker candles from postgres...</div>;
    }

    if (values.length === 0) {
        return <div className="grid h-full place-items-center text-[12px] text-term-dim">{"// no persisted candles yet — incoming ticker.update frames will start the chart"}</div>;
    }

    const width = 1000;
    const height = 260;
    const left = 70;
    const right = 18;
    const top = 18;
    const bottom = 30;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const rawMin = Math.min(...values.map((candle) => candle.lowValue));
    const rawMax = Math.max(...values.map((candle) => candle.highValue));
    const padding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.0005, 0.01);
    const min = rawMin - padding;
    const max = rawMax + padding;
    const range = max - min || 1;
    const step = plotWidth / values.length;
    const bodyWidth = Math.max(1, Math.min(7, step * 0.65));
    const y = (value: number) => top + ((max - value) / range) * plotHeight;
    const first = values[0]!;
    const last = values[values.length - 1]!;
    const change = last.closeValue - first.openValue;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-border bg-secondary px-3 py-1 text-[11px]">
                <span className="text-term-dim">OHLC · {values.length} × 1m · quote={quoteAsset}</span>
                <span className={change >= 0 ? "text-term-green" : "text-term-red"}>
                    last={formatPrice(last.closeValue)} · {change >= 0 ? "+" : ""}{formatPrice(change)}
                </span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="min-h-0 w-full flex-1" role="img" aria-label={`${quoteAsset} one minute ticker candlestick chart`}>
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const value = max - range * ratio;
                    const lineY = top + plotHeight * ratio;
                    return (
                        <g key={ratio}>
                            <line x1={left} x2={width - right} y1={lineY} y2={lineY} className="stroke-border" strokeWidth="1" />
                            <text x={left - 8} y={lineY + 4} textAnchor="end" className="fill-term-dim text-[10px]">{formatPrice(value)}</text>
                        </g>
                    );
                })}
                {values.map((candle, index) => {
                    const centerX = left + step * index + step / 2;
                    const openY = y(candle.openValue);
                    const closeY = y(candle.closeValue);
                    const up = candle.closeValue >= candle.openValue;
                    const bodyY = Math.min(openY, closeY);
                    const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
                    const colorClass = up ? "stroke-term-green fill-term-green" : "stroke-term-red fill-term-red";
                    return (
                        <g key={`${candle.bucketStart}-${index}`} className={colorClass} opacity={candle.live ? 1 : 0.78}>
                            <line x1={centerX} x2={centerX} y1={y(candle.highValue)} y2={y(candle.lowValue)} strokeWidth={candle.live ? 2 : 1} />
                            <rect x={centerX - bodyWidth / 2} y={bodyY} width={bodyWidth} height={bodyHeight} strokeWidth="1" />
                        </g>
                    );
                })}
                <text x={left} y={height - 8} className="fill-term-dim text-[10px]">{formatChartTime(first.bucketStart)}</text>
                <text x={width - right} y={height - 8} textAnchor="end" className="fill-term-dim text-[10px]">{formatChartTime(last.bucketStart)}{last.live ? " · LIVE" : ""}</text>
            </svg>
        </div>
    );
}

function formatPrice(value: number) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatChartTime(timestamp: number) {
    return formatIstMinute(timestamp);
}

function OrderBook({ bids, asks }: { bids: DepthLevel[]; asks: DepthLevel[] }) {
    const levels = [...asks.slice(0, 8).reverse().map((level) => ({ ...level, side: "ask" as const })), ...bids.slice(0, 8).map((level) => ({ ...level, side: "bid" as const }))];
    return <table className="w-full text-[12px]"><thead className="border-b border-border bg-secondary text-[11px] uppercase text-term-dim"><tr><th className="px-2 py-1 text-left">side</th><th className="px-2 py-1 text-right">price</th><th className="px-2 py-1 text-right">quantity</th></tr></thead><tbody>{levels.length === 0 ? <tr><td colSpan={3} className="p-3 text-term-dim">{"// empty book"}</td></tr> : levels.map((level, index) => <tr key={`${level.side}-${level.price}-${index}`} className="border-b border-border"><td className={level.side === "bid" ? "px-2 py-0.5 text-term-green" : "px-2 py-0.5 text-term-red"}>{level.side}</td><td className="px-2 py-0.5 text-right">{level.price}</td><td className="px-2 py-0.5 text-right text-term-dim">{level.quantity}</td></tr>)}</tbody></table>;
}

function OrderTable({ rows, onCancel }: { rows: Order[]; onCancel?: (orderId: string) => void }) {
    return (
        <table className="w-full text-[11px]">
            <thead className="border-b border-border bg-secondary uppercase text-term-dim">
                <tr>
                    <th className="px-2 py-1 text-left">id</th>
                    <th className="px-2 py-1">side</th>
                    <th className="px-2 py-1">type</th>
                    <th className="px-2 py-1 text-right">price</th>
                    <th className="px-2 py-1 text-right">qty / filled</th>
                    <th className="px-2 py-1">status</th>
                    {onCancel && <th />}
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 ?
                    <tr>
                        <td colSpan={7} className="p-3 text-term-dim">
                            {"// no orders returned"}
                        </td>
                    </tr>
                    :
                    rows.map((order) =>
                        <tr key={order.orderId} className="border-b border-border">
                            <td className="max-w-28 truncate px-2 py-1 text-term-dim" title={order.orderId}>{order.orderId}</td>
                            <td className={order.side === "BUY" ? "px-2 py-1 text-term-green" : "px-2 py-1 text-term-red"}>{order.side}</td>
                            <td className="px-2 py-1">{order.type}{order.reduceOnly ? " · reduce" : ""}</td>
                            <td className="px-2 py-1 text-right">{order.entryPrice}</td>
                            <td className="px-2 py-1 text-right">{order.quantity} / {order.filled}</td>
                            <td className="px-2 py-1 text-term-cyan">{order.status}</td>
                            {onCancel &&
                                <td className="px-2 py-1 text-right">
                                    <button onClick={() => onCancel(order.orderId)} className="text-term-yellow hover:underline">cancel</button>
                                </td>
                            }
                        </tr>
                    )
                }
            </tbody>
        </table>
    )
}
