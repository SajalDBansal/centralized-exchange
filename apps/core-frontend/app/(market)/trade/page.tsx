"use client";
import { toast } from "sonner";
import { ChevronDown, Search, Star, Camera, Maximize2, Crosshair, Settings2, Undo2, Redo2, type LucideIcon } from "lucide-react";
import {
    type Balance, type FundingRow, type OpenOrder, type OrderHistoryRow,
    type Position, type TradeHistoryRow,
} from "@/lib/mock-data";
import { fmtPrice, fmtPct, fmtCompact, fmtAmount, fmtUsd } from "@/lib/format";
import { Input } from "@workspace/ui/components/input";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { DepthB, KlinesB, MarketB, MarkPriceB, OpenInterestB, TickerB, TradesB } from "@workspace/types";
import { getCurrentMarketData, getMarketDepth, getMarketKLines, getTickers } from "@/utils/http-client";
import { symbolParts } from "@/lib/market-ops";
import Image from "next/image";
import {
    backpackWs,
    tickerFromWs,
    wsStreams,
    type BackpackPublicEvent,
    type DepthWsEvent,
    type KlineWsEvent,
} from "@/utils/ws-client";

type TradeMarket = {
    symbol: string;
    display: string;
    base: string;
    quote: string;
    type: "spot" | "perp";
    price: number;
    change24h: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    fundingRate?: number;
    openInterest?: number;
    markPrice?: number;
    indexPrice?: number;
    nextFundingTimestamp?: number;
    fundingInterval?: number;
    tickSize: string;
    stepSize: string;
    minQuantity: string;
    status: string;
    maxLeverage?: number;
    icon: string;
};

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type OrderBookRow = { price: number; size: number; total: number };
type OrderBook = { bids: OrderBookRow[]; asks: OrderBookRow[] };
type RecentTrade = { id: string; price: number; size: number; side: "buy" | "sell"; time: string };
type BottomTab = "balances" | "positions" | "open" | "borrows" | "twap" | "fills" | "history" | "pos-history" | "funding";

const BALANCES: Balance[] = [];
const POSITIONS: Position[] = [];
const OPEN_ORDERS: OpenOrder[] = [];
const ORDER_HISTORY: OrderHistoryRow[] = [];
const TRADE_HISTORY: TradeHistoryRow[] = [];
const FUNDING_HISTORY: FundingRow[] = [];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const timeframeSeconds: Record<(typeof TIMEFRAMES)[number], number> = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1d": 86_400,
};
const INDIA_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
});

const toNumber = (value: string | undefined) => Number(value) || 0;
const normalizeSymbol = (value: string | null) => {
    if (!value) return "BTC_USDC_PERP";
    if (value.includes("_")) return value.toUpperCase();
    if (value.endsWith("-PERP")) return `${value.slice(0, -5).toUpperCase()}_USDC_PERP`;
    if (value.includes("/")) return value.replace("/", "_").toUpperCase();
    return "BTC_USDC_PERP";
};

function createTradeMarket(ticker: TickerB, market: MarketB, markPrice: MarkPriceB | null, openInterest: OpenInterestB | null): TradeMarket {
    const { base, quote, display } = symbolParts(ticker.symbol);
    const maxLeverage = market.imfFunction ? Math.round(1 / Number(market.imfFunction.base)) : undefined;
    return {
        symbol: ticker.symbol,
        display,
        base,
        quote,
        type: market.marketType === "PERP" ? "perp" : "spot",
        price: toNumber(ticker.lastPrice),
        change24h: toNumber(ticker.priceChangePercent) * 100,
        high24h: toNumber(ticker.high),
        low24h: toNumber(ticker.low),
        volume24h: toNumber(ticker.quoteVolume),
        fundingRate: markPrice ? toNumber(markPrice.fundingRate) : undefined,
        openInterest: openInterest ? toNumber(openInterest.openInterest) : undefined,
        markPrice: markPrice ? toNumber(markPrice.markPrice) : undefined,
        indexPrice: markPrice ? toNumber(markPrice.indexPrice) : undefined,
        nextFundingTimestamp: markPrice?.nextFundingTimestamp,
        fundingInterval: market.fundingInterval ?? undefined,
        tickSize: market.filters.price.tickSize,
        stepSize: market.filters.quantity.stepSize,
        minQuantity: market.filters.quantity.minQuantity,
        status: market.orderBookState,
        maxLeverage,
        icon: base.slice(0, 2),
    };
}

function createOrderBook(depth: DepthB | null, rows = 16): OrderBook {
    const cumulativeRows = (levels: DepthB["bids"], side: "bid" | "ask"): OrderBookRow[] => {
        let total = 0;
        const sortedLevels = [...levels].sort(([leftPrice], [rightPrice]) =>
            side === "bid"
                ? toNumber(rightPrice) - toNumber(leftPrice)
                : toNumber(leftPrice) - toNumber(rightPrice),
        );

        return sortedLevels.slice(0, rows).map(([price, quantity]) => {
            const size = toNumber(quantity);
            total += size;
            return { price: toNumber(price), size, total };
        });
    };
    return {
        bids: cumulativeRows(depth?.bids ?? [], "bid"),
        asks: cumulativeRows(depth?.asks ?? [], "ask"),
    };
}

const createCandles = (klines: KlinesB[]): Candle[] => klines.map((item) => ({
    t: new Date(`${item.start.replace(" ", "T")}Z`).getTime(),
    o: toNumber(item.open), h: toNumber(item.high), l: toNumber(item.low), c: toNumber(item.close), v: toNumber(item.volume),
}));

const createRecentTrades = (trades: TradesB[]): RecentTrade[] => trades.map((item) => ({
    id: String(item.id),
    price: toNumber(item.price),
    size: toNumber(item.quantity),
    side: item.isBuyerMaker ? "sell" : "buy",
    time: new Date(item.timestamp).toLocaleTimeString("en-GB", { hour12: false }),
}));

function applyDepthUpdate(snapshot: DepthB, event: DepthWsEvent): DepthB | "gap" {
    const lastUpdateId = Number(snapshot.lastUpdateId);
    if (event.u <= lastUpdateId) return snapshot;
    if (event.U > lastUpdateId + 1) return "gap";

    const applyLevels = (current: DepthB["bids"], updates: DepthB["bids"]) => {
        const levels = new Map(current);
        for (const [price, quantity] of updates) {
            if (Number(quantity) === 0) levels.delete(price);
            else levels.set(price, quantity);
        }
        return [...levels.entries()] as DepthB["bids"];
    };

    return {
        bids: applyLevels(snapshot.bids, event.b),
        asks: applyLevels(snapshot.asks, event.a),
        lastUpdateId: String(event.u),
        timestamp: Math.floor(event.T / 1_000),
    };
}

const klineFromWs = (event: KlineWsEvent, previous?: KlinesB): KlinesB => ({
    start: event.t,
    end: event.T,
    open: event.o,
    close: event.c,
    high: event.h,
    low: event.l,
    volume: event.v,
    quoteVolume: previous?.quoteVolume ?? "0",
    trades: String(event.n),
});

const fundingCountdown = (timestamp?: number) => {
    if (!timestamp) return "—";
    const remainingSeconds = Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
    const hours = Math.floor(remainingSeconds / 3_600);
    const minutes = Math.floor((remainingSeconds % 3_600) / 60);
    const seconds = remainingSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
};

export default function TradePage() {
    return (
        <Suspense fallback={<div className="grid min-h-[calc(100vh-7rem)] place-items-center text-sm text-muted-foreground">Loading trading terminal…</div>}>
            <TradePageContent />
        </Suspense>
    );
}

function TradePageContent() {
    const searchParams = useSearchParams();
    const initialSymbol = normalizeSymbol(searchParams.get("symbol"));
    const [symbol, setSymbol] = useState(initialSymbol);
    const [tickerData, setTickerData] = useState<TickerB | null>(null);
    const [marketData, setMarketData] = useState<MarketB | null>(null);
    const [markPriceData, setMarkPriceData] = useState<MarkPriceB | null>(null);
    const [openInterestData, setOpenInterestData] = useState<OpenInterestB | null>(null);
    const [tradeData, setTradeData] = useState<TradesB[]>([]);
    const [depthData, setDepthData] = useState<DepthB | null>(null);
    const [klinesData, setKlinesData] = useState<KlinesB[]>([]);
    const [allTickers, setAllTickers] = useState<TickerB[]>([]);
    const [dataError, setDataError] = useState<string | null>(null);
    const [chartTab, setChartTab] = useState<"Chart" | "Depth" | "Margin" | "Funding" | "Market Info">("Chart");
    const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("1h");
    const [rightTab, setRightTab] = useState<"Book" | "Trades">("Book");
    const [bottomTab, setBottomTab] = useState<BottomTab>("balances");
    const [pairOpen, setPairOpen] = useState(false);
    const [pairSearch, setPairSearch] = useState("");
    const [localOrders, setLocalOrders] = useState<OpenOrder[]>(OPEN_ORDERS);
    const [currentTime, setCurrentTime] = useState(() => Date.now());
    const depthSnapshotRef = useRef<{ symbol: string; data: DepthB } | null>(null);
    const depthResyncRef = useRef<string | null>(null);

    useEffect(() => {
        const clock = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
        return () => window.clearInterval(clock);
    }, []);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getCurrentMarketData(symbol, 150), getTickers()])
            .then(([data, tickers]) => {
                if (cancelled) return;
                setTickerData(data.ticker);
                setMarketData(data.market);
                setMarkPriceData(data.markPrice);
                setOpenInterestData(data.openInterest);
                setTradeData(data.trades);
                depthSnapshotRef.current = { symbol, data: data.depth };
                setDepthData(data.depth);
                setAllTickers(tickers);
                setDataError(null);
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                console.error(error);
                setDataError("Unable to load this market. Check the proxy server and try another pair.");
            });

        return () => {
            cancelled = true;
        };
    }, [symbol]);

    useEffect(() => {
        let active = true;

        const resyncDepth = () => {
            if (depthResyncRef.current === symbol) return;
            depthResyncRef.current = symbol;
            void getMarketDepth(symbol)
                .then((snapshot) => {
                    if (!active) return;
                    depthSnapshotRef.current = { symbol, data: snapshot };
                    setDepthData(snapshot);
                })
                .catch((error: unknown) => console.error("Failed to resync order book", error))
                .finally(() => {
                    if (depthResyncRef.current === symbol) depthResyncRef.current = null;
                });
        };

        const streams = [
            wsStreams.depth(symbol),
            wsStreams.trade(symbol),
            wsStreams.markPrice(symbol),
            wsStreams.ticker(symbol),
            ...(symbol.endsWith("_PERP") ? [wsStreams.openInterest(symbol)] : []),
        ];

        const unsubscribe = backpackWs.subscribe(streams, (event: BackpackPublicEvent) => {
            if (!active || event.s !== symbol) return;

            if (event.e === "ticker") {
                const ticker = tickerFromWs(event);
                setTickerData(ticker);
                setAllTickers((current) => current.map((item) => item.symbol === ticker.symbol ? ticker : item));
                return;
            }

            if (event.e === "markPrice") {
                setMarkPriceData({
                    symbol: event.s,
                    markPrice: event.p,
                    fundingRate: event.f ?? "0",
                    indexPrice: event.i ?? event.p,
                    nextFundingTimestamp: event.n ?? 0,
                });
                return;
            }

            if (event.e === "openInterest") {
                setOpenInterestData({ symbol: event.s, openInterest: event.o, timestamp: Math.floor(event.E / 1_000) });
                return;
            }

            if (event.e === "trade") {
                const trade: TradesB = {
                    id: event.t,
                    isBuyerMaker: event.m,
                    price: event.p,
                    quantity: event.q,
                    quoteQuantity: String(Number(event.p) * Number(event.q)),
                    timestamp: Math.floor(event.T / 1_000),
                };
                setTradeData((current) => [trade, ...current.filter((item) => item.id !== trade.id)].slice(0, 150));
                return;
            }

            if (event.e === "depth") {
                const current = depthSnapshotRef.current;
                if (!current || current.symbol !== symbol) {
                    resyncDepth();
                    return;
                }
                const updated = applyDepthUpdate(current.data, event);
                if (updated === "gap") {
                    resyncDepth();
                    return;
                }
                depthSnapshotRef.current = { symbol, data: updated };
                setDepthData(updated);
            }
        });

        return () => {
            active = false;
            unsubscribe();
            if (depthSnapshotRef.current?.symbol === symbol) depthSnapshotRef.current = null;
        };
    }, [symbol]);

    useEffect(() => {
        let cancelled = false;
        const startTime = Math.floor(Date.now() / 1000) - timeframeSeconds[tf] * 90;
        getMarketKLines(symbol, tf, startTime)
            .then((data) => {
                if (!cancelled) setKlinesData(data);
            })
            .catch((error: unknown) => {
                if (!cancelled) console.error(error);
            });

        return () => {
            cancelled = true;
        };
    }, [symbol, tf]);

    useEffect(() => backpackWs.subscribe(wsStreams.kline(symbol, tf), (event: BackpackPublicEvent) => {
        if (event.e !== "kline" || event.s !== symbol) return;
        setKlinesData((current) => {
            const index = current.findIndex((item) => item.start === event.t);
            if (index === -1) return [...current, klineFromWs(event)].slice(-90);
            const next = [...current];
            next[index] = klineFromWs(event, current[index]);
            return next;
        });
    }), [symbol, tf]);

    const market = useMemo(() => {
        if (!tickerData || tickerData.symbol !== symbol || !marketData || marketData.symbol !== symbol) return null;
        return createTradeMarket(tickerData, marketData, markPriceData, openInterestData);
    }, [marketData, markPriceData, openInterestData, symbol, tickerData]);
    const candles = useMemo(() => createCandles(klinesData), [klinesData]);
    const book = useMemo(() => createOrderBook(depthData), [depthData]);
    const trades = useMemo(() => createRecentTrades(tradeData), [tradeData]);

    const pairList = allTickers.filter((ticker) => ticker.symbol.toLowerCase().includes(pairSearch.toLowerCase()));
    if (!market) {
        return (
            <div className="grid min-h-[calc(100vh-7rem)] place-items-center bg-background p-6 text-sm text-muted-foreground">
                {dataError ?? `Loading ${symbol} market data…`}
            </div>
        );
    }

    const isPerp = market.type === "perp";

    const onPlace = (o: OpenOrder) => {
        setLocalOrders((p) => [o, ...p]);
        toast.success(`${o.side === "buy" ? (isPerp ? "Long" : "Buy") : (isPerp ? "Short" : "Sell")} ${o.amount} ${market.base}`, {
            description: "Frontend demo only — no real order executed.",
        });
    };

    return (
        <div className="min-h-[calc(100vh-7rem)] bg-background text-[13px]">
            {/* ============ Pair Header ============ */}
            <div className="border-b border-border bg-background">
                <div className="flex flex-wrap items-center gap-x-7 gap-y-2 px-4 py-2.5">
                    <div className="relative">
                        <button onClick={() => setPairOpen((v) => !v)} className="flex items-center gap-2.5 group">
                            <Image
                                src={`https://backpack.exchange/coins/${market.base.toLocaleLowerCase()}.png`}
                                alt={`${market.base} Logo`}
                                width={30}
                                height={30}
                                className="z-10 mr-2 rounded-full"
                            />
                            <div className="flex items-center gap-1.5">
                                <span className="text-[15px] font-bold">{market.display}</span>
                                {isPerp && market.maxLeverage && <span className="text-[10px] uppercase rounded px-1.5 py-0.5 font-bold bg-primary/15 text-primary">{market.maxLeverage}x</span>}
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                            </div>
                        </button>
                        {pairOpen && (
                            <div className="absolute z-30 mt-2 w-80 rounded-lg border border-border bg-card shadow-xl p-2" onMouseLeave={() => setPairOpen(false)}>
                                <div className="relative mb-2">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input className="pl-8 h-8 bg-elevated border-border" placeholder="Search pair…" value={pairSearch} onChange={(e) => setPairSearch(e.target.value)} autoFocus />
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {pairList.map((m) => (
                                        <button key={m.symbol} onClick={() => { setSymbol(m.symbol); setKlinesData([]); setPairOpen(false); setPairSearch(""); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-elevated text-left">
                                            <span className="font-medium">{symbolParts(m.symbol).display}</span>
                                            <span className={`text-xs tabular ${toNumber(m.priceChangePercent) >= 0 ? "text-up" : "text-down"}`}>{fmtPct(toNumber(m.priceChangePercent) * 100)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="leading-tight">
                        <div className={`text-[20px] font-bold tabular ${market.change24h >= 0 ? "text-up" : "text-down"}`}>{fmtPrice(market.price)}</div>
                        <div className="text-[11px] text-muted-foreground tabular">Mark {fmtPrice(market.markPrice ?? market.price)}</div>
                    </div>

                    <HStat label="Index Price" value={fmtPrice(market.indexPrice ?? market.price)} />
                    <HStat label="24H Change" value={`${fmtPrice(Math.abs(market.price * market.change24h / 100))}  ${fmtPct(market.change24h)}`} tone={market.change24h >= 0 ? "up" : "down"} />
                    {isPerp && (
                        <HStat label="Funding / Countdown" value={`${fmtPct((market.fundingRate ?? 0) * 100)} / ${fundingCountdown(market.nextFundingTimestamp)}`} tone={(market.fundingRate ?? 0) >= 0 ? "up" : "down"} />
                    )}
                    <HStat label="24H High" value={fmtPrice(market.high24h)} />
                    <HStat label="24H Low" value={fmtPrice(market.low24h)} />
                    <HStat label="24H Volume (USD)" value={fmtCompact(market.volume24h).replace("$", "")} />
                    {isPerp && <HStat label={`Open Interest (${market.base})`} value={fmtCompact(market.openInterest ?? 0).replace("$", "")} />}

                    <button onClick={() => toast("Added to watchlist (demo)")} className="ml-auto h-8 w-8 grid place-items-center rounded hover:bg-elevated text-muted-foreground">
                        <Star className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* ============ Main 3-column body ============ */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px_340px] gap-px bg-border">
                {/* CHART column */}
                <div className="bg-background flex flex-col">
                    {/* Chart tabs */}
                    <div className="flex items-center gap-4 px-4 pt-2.5 border-b border-border">
                        {(["Chart", "Depth", "Margin", "Funding", "Market Info"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setChartTab(t)}
                                className={`pb-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${chartTab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            >
                                {t}
                            </button>
                        ))}
                        <div className="ml-auto flex items-center gap-1 pb-1.5">
                            <SmallTab active>Last</SmallTab>
                            <SmallTab>Mark</SmallTab>
                            <SmallTab>Index</SmallTab>
                        </div>
                    </div>

                    {/* Chart toolbar */}
                    {chartTab === "Chart" && (
                        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border">
                            {TIMEFRAMES.map((timeframe) => (
                                <button key={timeframe} onClick={() => setTf(timeframe)} className={`px-2 py-1 text-xs font-semibold rounded hover:bg-elevated ${tf === timeframe ? "text-foreground bg-elevated" : "text-muted-foreground"}`}>{timeframe}</button>
                            ))}
                            <div className="h-4 w-px bg-border mx-1" />
                            <IconBtn Icon={Settings2} label="Indicators (fx)" />
                            <button className="text-xs px-2 py-1 rounded hover:bg-elevated text-muted-foreground">Indicators</button>
                            <div className="h-4 w-px bg-border mx-1" />
                            <button className="text-[11px] px-2 py-1 rounded hover:bg-elevated text-muted-foreground font-mono">OL</button>
                            <button className="text-[11px] px-2 py-1 rounded hover:bg-elevated text-muted-foreground font-mono">TE</button>
                            <IconBtn Icon={Undo2} label="Undo" />
                            <IconBtn Icon={Redo2} label="Redo" />
                            <div className="ml-auto flex items-center gap-1">
                                <IconBtn Icon={Crosshair} label="Crosshair" />
                                <IconBtn Icon={Maximize2} label="Fullscreen" />
                                <IconBtn Icon={Camera} label="Screenshot" />
                                <button onClick={() => toast("Reset chart")} className="text-xs px-2 py-1 rounded hover:bg-elevated text-muted-foreground">Reset</button>
                            </div>
                        </div>
                    )}

                    {/* Sub-header OHLC */}
                    {chartTab === "Chart" && (
                        <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border flex flex-wrap items-center gap-x-3 tabular">
                            <span className="text-foreground font-semibold">{market.display} · {tf} · Backpack</span>
                            <span>O <span className="text-foreground">{fmtPrice(candles[candles.length - 2]?.o ?? market.price)}</span></span>
                            <span>H <span className="text-foreground">{fmtPrice(candles[candles.length - 1]?.h ?? market.price)}</span></span>
                            <span>L <span className="text-foreground">{fmtPrice(candles[candles.length - 1]?.l ?? market.price)}</span></span>
                            <span>C <span className={market.change24h >= 0 ? "text-up" : "text-down"}>{fmtPrice(market.price)}</span></span>
                            <span className={market.change24h >= 0 ? "text-up" : "text-down"}>{fmtPct(market.change24h)}</span>
                        </div>
                    )}

                    <div className="flex-1 min-h-[420px] relative">
                        {chartTab === "Chart" && <CandleChart candles={candles} />}
                        {chartTab === "Depth" && <DepthChart book={book} mid={market.price} />}
                        {chartTab === "Margin" && <InfoPanel title="Margin Requirements" rows={[
                            ["Initial Margin", market.maxLeverage ? `${(100 / market.maxLeverage).toFixed(2)}%` : "—"],
                            ["Max Leverage", market.maxLeverage ? `${market.maxLeverage}x` : "—"],
                            ["Market Type", isPerp ? "Perpetual" : "Spot"],
                        ]} />}
                        {chartTab === "Funding" && <InfoPanel title="Funding" rows={[
                            ["Current Rate", isPerp ? fmtPct((market.fundingRate ?? 0) * 100) : "Not applicable"],
                            ["Next Payment", fundingCountdown(market.nextFundingTimestamp)],
                            ["Payment Frequency", market.fundingInterval ? `Every ${market.fundingInterval / 3_600_000} hour(s)` : "Not applicable"],
                        ]} />}
                        {chartTab === "Market Info" && <InfoPanel title="Market Info" rows={[
                            ["Base / Quote", `${market.base} / ${market.quote}`],
                            ["Contract Type", isPerp ? "Perpetual" : "Spot"],
                            ["Tick Size", market.tickSize],
                            ["Step Size", market.stepSize],
                            ["Minimum Quantity", `${market.minQuantity} ${market.base}`],
                            ["Status", market.status],
                        ]} />}
                    </div>

                    {/* Timeline strip */}
                    <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
                        {TIMEFRAMES.map((timeframe) => (
                            <button
                                key={timeframe}
                                type="button"
                                aria-pressed={tf === timeframe}
                                onClick={() => setTf(timeframe)}
                                className={`rounded px-2 py-0.5 font-medium transition-colors hover:bg-elevated ${tf === timeframe ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            >
                                {timeframe}
                            </button>
                        ))}
                        <span className="ml-auto tabular text-foreground" suppressHydrationWarning>
                            {INDIA_TIME_FORMATTER.format(currentTime)} (UTC+5:30)
                        </span>
                        <span className="text-foreground">log</span>
                        <span className="text-primary">auto</span>
                    </div>
                </div>

                {/* ORDER BOOK + TRADES column */}
                <div className="bg-background flex max-h-[700px] min-h-0 flex-col overflow-hidden">
                    <div className="flex items-center gap-4 px-3 pt-2.5 border-b border-border">
                        {(["Book", "Trades"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setRightTab(t)}
                                className={`pb-2 text-[13px] font-medium border-b-2 -mb-px ${rightTab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            >
                                {t}
                            </button>
                        ))}
                        <div className="ml-auto flex items-center gap-1 pb-1.5">
                            <button className="text-[11px] px-1.5 py-0.5 rounded hover:bg-elevated text-muted-foreground">−</button>
                            <span className="text-[11px] tabular text-muted-foreground">0.1</span>
                            <button className="text-[11px] px-1.5 py-0.5 rounded hover:bg-elevated text-muted-foreground">+</button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">
                        {rightTab === "Book" ? (
                            <OrderBookPanel market={market} book={book} />
                        ) : (
                            <RecentTradesPanel market={market} trades={trades} />
                        )}
                    </div>
                </div>

                {/* TRADE FORM column */}
                <div className="bg-background">
                    <TradeForm key={market.symbol} market={market} onPlace={onPlace} balances={BALANCES} />
                </div>
            </div>

            {/* ============ Bottom panel ============ */}
            <div className="border-t border-border bg-background">
                <div className="flex gap-5 px-4 border-b border-border overflow-x-auto">
                    {([
                        ["balances", "Balances"],
                        ["positions", `Positions (${POSITIONS.filter((p) => p.status === "open").length})`],
                        ["open", `Open Orders (${localOrders.length})`],
                        ["borrows", "Borrows"],
                        ["twap", "TWAP"],
                        ["fills", "Fill History"],
                        ["history", "Order History"],
                        ["pos-history", "Position History"],
                        ["funding", "Funding History"],
                    ] as const).map(([k, l]) => (
                        <button
                            key={k}
                            onClick={() => setBottomTab(k)}
                            className={`py-2.5 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap ${bottomTab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                        >
                            {l}
                        </button>
                    ))}
                </div>
                <div className="overflow-x-auto">
                    {bottomTab === "balances" && <BalancesMiniTable />}
                    {bottomTab === "positions" && <PositionsTable rows={POSITIONS.filter((p) => p.status === "open")} />}
                    {bottomTab === "open" && <OpenOrdersTable rows={localOrders} onCancel={(id) => { setLocalOrders((p) => p.filter((o) => o.id !== id)); toast("Order cancelled", { description: "Demo only." }); }} />}
                    {bottomTab === "borrows" && <Empty label="No active borrows" />}
                    {bottomTab === "twap" && <Empty label="No TWAP orders" />}
                    {bottomTab === "fills" && <TradeHistoryTable rows={TRADE_HISTORY} />}
                    {bottomTab === "history" && <OrderHistoryTable rows={ORDER_HISTORY} />}
                    {bottomTab === "pos-history" && <PositionsTable rows={POSITIONS} includeStatus />}
                    {bottomTab === "funding" && <FundingTable rows={FUNDING_HISTORY} />}
                </div>
            </div>
        </div>
    );
}

/* ---------- Header helpers ---------- */
function HStat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
    const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground";
    return (
        <div className="leading-tight">
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className={`text-[12px] font-semibold tabular ${c}`}>{value}</div>
        </div>
    );
}
function SmallTab({ children, active }: { children: ReactNode; active?: boolean }) {
    return <button className={`px-2 py-0.5 text-[11px] rounded ${active ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{children}</button>;
}
function IconBtn({ Icon, label }: { Icon: LucideIcon; label: string }) {
    return (
        <button onClick={() => toast(label, { description: "Demo only" })} className="h-7 w-7 grid place-items-center rounded hover:bg-elevated text-muted-foreground hover:text-foreground">
            <Icon className="h-3.5 w-3.5" />
        </button>
    );
}

/* ---------- Chart ---------- */
function CandleChart({ candles }: { candles: Candle[] }) {
    if (candles.length === 0) return <Empty label="No candle data available" />;
    const max = Math.max(...candles.map((c) => c.h));
    const min = Math.min(...candles.map((c) => c.l));
    const range = max - min || 1;
    const w = 1000, h = 420, pad = 40;
    const cw = (w - pad) / candles.length;
    const y = (p: number) => h - pad - ((p - min) / range) * (h - pad * 1.5);
    const grids = Array.from({ length: 6 }, (_, i) => min + (range * i) / 5);
    const last = candles[candles.length - 1];

    if (!last) return null;

    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
            {grids.map((g, i) => (
                <g key={i}>
                    <line x1={0} x2={w - pad} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeDasharray="2 4" />
                    <text x={w - pad + 4} y={y(g) + 4} fill="var(--color-muted-foreground)" fontSize={10} fontFamily="var(--font-mono)">{fmtPrice(g)}</text>
                </g>
            ))}
            {candles.map((c, i) => {
                const up = c.c >= c.o;
                const color = up ? "var(--color-up)" : "var(--color-down)";
                const cx = i * cw + cw / 2;
                return (
                    <g key={i}>
                        <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1} />
                        <rect x={cx - cw * 0.35} width={cw * 0.7} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={color} />
                    </g>
                );
            })}
            {/* current price label */}
            <line x1={0} x2={w - pad} y1={y(last.c)} y2={y(last.c)} stroke="var(--color-primary)" strokeDasharray="3 3" strokeWidth={0.8} opacity={0.7} />
            <rect x={w - pad + 1} y={y(last.c) - 8} width={pad - 2} height={16} fill="var(--color-primary)" rx={2} />
            <text x={w - pad + 6} y={y(last.c) + 4} fill="var(--color-primary-foreground)" fontSize={10} fontFamily="var(--font-mono)" fontWeight="bold">{fmtPrice(last.c)}</text>
        </svg>
    );
}

function DepthChart({ book, mid }: { book: OrderBook; mid: number }) {
    if (book.bids.length === 0 || book.asks.length === 0) return <Empty label="No depth data available" />;
    const w = 1000, h = 420;
    const maxTotal = Math.max(...book.bids.map((b) => b.total), ...book.asks.map((a) => a.total));
    const allPrices = [...book.bids.map((b) => b.price), ...book.asks.map((a) => a.price)];
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const x = (p: number) => ((p - minP) / (maxP - minP)) * w;
    const y = (t: number) => h - (t / maxTotal) * (h - 20) - 10;
    const bidPts = [...book.bids].reverse().map((b) => `${x(b.price)},${y(b.total)}`).join(" ");
    const askPts = book.asks.map((a) => `${x(a.price)},${y(a.total)}`).join(" ");
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
            <polyline points={`0,${h} ${bidPts} ${x(mid)},${h}`} fill="rgba(14,203,129,0.15)" stroke="var(--color-up)" strokeWidth={1.5} />
            <polyline points={`${x(mid)},${h} ${askPts} ${w},${h}`} fill="rgba(246,70,93,0.15)" stroke="var(--color-down)" strokeWidth={1.5} />
            <line x1={x(mid)} x2={x(mid)} y1={0} y2={h} stroke="var(--color-border)" strokeDasharray="3 3" />
        </svg>
    );
}

function InfoPanel({ title, rows }: { title: string; rows: [string, string][] }) {
    return (
        <div className="p-6">
            <h3 className="font-semibold text-base mb-4">{title}</h3>
            <div className="space-y-2.5 text-sm max-w-md">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-semibold tabular">{v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---------- Order book ---------- */
function OrderBookPanel({ market, book }: { market: TradeMarket; book: OrderBook }) {
    if (book.bids.length === 0 || book.asks.length === 0) return <Empty label="No order book data available" />;
    const maxTotal = Math.max(...book.bids.map((b) => b.total), ...book.asks.map((a) => a.total));
    const bidSum = book.bids.reduce((s, b) => s + b.size, 0);
    const askSum = book.asks.reduce((s, a) => s + a.size, 0);
    const bidPct = (bidSum / (bidSum + askSum)) * 100;
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Price ({market.quote.replace("USDT", "USD")})</span>
                <span className="text-right">Size ({market.base})</span>
                <span className="text-right">Total ({market.base})</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {[...book.asks].reverse().map((a, i) => (
                    <BookRow key={`a${i}`} row={a} side="ask" maxTotal={maxTotal} />
                ))}
                <div className="px-3 py-2 my-0.5 bg-elevated/40 flex items-center gap-3">
                    <span className={`text-[18px] font-bold tabular ${market.change24h >= 0 ? "text-up" : "text-down"}`}>{fmtPrice(market.price)}</span>
                    <span className="text-[12px] text-muted-foreground tabular">{fmtPrice(market.price * 0.99995)}</span>
                </div>
                {book.bids.map((b, i) => (
                    <BookRow key={`b${i}`} row={b} side="bid" maxTotal={maxTotal} />
                ))}
            </div>
            <div className="relative h-2 mx-3 mb-1 rounded overflow-hidden bg-elevated">
                <div className="absolute inset-y-0 left-0 bg-up/60" style={{ width: `${bidPct}%` }} />
                <div className="absolute inset-y-0 right-0 bg-down/60" style={{ width: `${100 - bidPct}%` }} />
            </div>
            <div className="flex justify-between px-3 pb-2 text-[10px] tabular">
                <span className="text-up">{bidPct.toFixed(0)}%</span>
                <span className="text-down">{(100 - bidPct).toFixed(0)}%</span>
            </div>
        </div>
    );
}
function BookRow({ row, side, maxTotal }: { row: { price: number; size: number; total: number }; side: "bid" | "ask"; maxTotal: number }) {
    const pct = (row.total / maxTotal) * 100;
    const bg = side === "bid" ? "rgba(14,203,129,0.12)" : "rgba(246,70,93,0.12)";
    const col = side === "bid" ? "text-up" : "text-down";
    return (
        <div className="relative grid grid-cols-3 px-3 py-[2px] text-[11px] tabular hover:bg-elevated/60">
            <div className="absolute inset-y-0 right-0" style={{ width: `${pct}%`, background: bg }} />
            <span className={`relative ${col}`}>{fmtPrice(row.price)}</span>
            <span className="relative text-right">{row.size.toFixed(4)}</span>
            <span className="relative text-right text-muted-foreground">{row.total.toFixed(3)}</span>
        </div>
    );
}

function RecentTradesPanel({ market, trades }: { market: TradeMarket; trades: RecentTrade[] }) {
    if (trades.length === 0) return <Empty label="No recent trades available" />;
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Price ({market.quote.replace("USDT", "USD")})</span>
                <span className="text-right">Size ({market.base})</span>
                <span className="text-right">Time</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {trades.map((t) => (
                    <div key={t.id} className="grid grid-cols-3 px-3 py-[2px] text-[11px] tabular hover:bg-elevated/60">
                        <span className={t.side === "buy" ? "text-up" : "text-down"}>{fmtPrice(t.price)}</span>
                        <span className="text-right">{t.size.toFixed(4)}</span>
                        <span className="text-right text-muted-foreground">{t.time}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---------- Trade form (Backpack-style) ---------- */
function TradeForm({ market, onPlace, balances }: { market: TradeMarket; onPlace: (o: OpenOrder) => void; balances: Balance[] }) {
    const isPerp = market.type === "perp";
    const [side, setSide] = useState<"buy" | "sell">("buy");
    const [orderType, setOrderType] = useState<"Limit" | "Market" | "Conditional">("Limit");
    const [price, setPrice] = useState(market.price.toFixed(1));
    const [qty, setQty] = useState("");
    const [orderValue, setOrderValue] = useState("");
    const [slider, setSlider] = useState(0);
    const [postOnly, setPostOnly] = useState(false);
    const [ioc, setIoc] = useState(false);
    const [reduceOnly, setReduceOnly] = useState(false);
    const [tpsl, setTpsl] = useState(false);

    const quoteBal = balances.find((b) => b.asset === market.quote)?.available ?? 0;
    const avail = quoteBal;

    const setQtyFromSlider = (pct: number) => {
        setSlider(pct);
        const px = parseFloat(price) || market.price;
        const value = (avail * pct) / 100;
        setOrderValue(value.toFixed(2));
        setQty((value / px).toFixed(4));
    };

    const submit = () => {
        const a = parseFloat(qty);
        const p = parseFloat(price);
        if (!a || a <= 0) return toast.error("Enter a quantity");
        if (orderType !== "Market" && (!p || p <= 0)) return toast.error("Enter a price");
        onPlace({
            id: "n" + Date.now(),
            time: new Date().toISOString().slice(0, 19).replace("T", " "),
            market: market.symbol,
            side,
            type: orderType,
            price: orderType === "Market" ? market.price : p,
            amount: a,
            filled: 0,
            status: orderType === "Market" ? "Filled" : "Open",
        });
        setQty("");
        setOrderValue("");
        setSlider(0);
    };

    const buyLabel = isPerp ? "Buy / Long" : "Buy";
    const sellLabel = isPerp ? "Sell / Short" : "Sell";

    return (
        <div className="flex flex-col h-full">
            {/* Side toggle */}
            <div className="grid grid-cols-2 px-3 pt-3 gap-2">
                <button onClick={() => setSide("buy")}
                    className={`py-2.5 rounded text-[13px] font-bold transition-colors ${side === "buy" ? "bg-up/15 text-up border border-up/40" : "bg-card text-muted-foreground border border-border hover:text-foreground"}`}>
                    {buyLabel}
                </button>
                <button onClick={() => setSide("sell")}
                    className={`py-2.5 rounded text-[13px] font-bold transition-colors ${side === "sell" ? "bg-down/15 text-down border border-down/40" : "bg-card text-muted-foreground border border-border hover:text-foreground"}`}>
                    {sellLabel}
                </button>
            </div>

            {/* Order type tabs */}
            <div className="flex items-center gap-5 px-3 pt-3 border-b border-border">
                {(["Limit", "Market", "Conditional"] as const).map((t) => (
                    <button key={t} onClick={() => setOrderType(t)}
                        className={`pb-2 text-[13px] font-medium border-b-2 -mb-px flex items-center gap-1 ${orderType === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                        {t}
                        {t === "Conditional" && <ChevronDown className="h-3 w-3" />}
                    </button>
                ))}
            </div>

            <div className="px-3 py-3 space-y-3 overflow-y-auto">
                <RowKV k="Available Equity" v={fmtUsd(avail)} />

                <FieldStack label="Price" right={
                    <div className="flex gap-1">
                        <ChipBtn onClick={() => setPrice(market.price.toFixed(1))}>Mid</ChipBtn>
                        <ChipBtn onClick={() => setPrice((market.price * 1.0001).toFixed(1))}>BBO</ChipBtn>
                    </div>
                }>
                    <NumberField value={orderType === "Market" ? "Market" : price} onChange={setPrice} disabled={orderType === "Market"} suffix="$" />
                </FieldStack>

                <FieldStack label="Quantity">
                    <NumberField value={qty} onChange={(v) => {
                        setQty(v);
                        const a = parseFloat(v) || 0;
                        const p = parseFloat(price) || market.price;
                        setOrderValue((a * p).toFixed(2));
                        setSlider(Math.min(100, (a * p / Math.max(avail, 1)) * 100));
                    }} suffix={market.icon} />
                </FieldStack>

                {/* Slider */}
                <div className="pt-1">
                    <div className="relative h-6 flex items-center">
                        <div className="absolute inset-x-0 h-1 bg-elevated rounded-full" />
                        <div className="absolute h-1 rounded-full bg-primary" style={{ width: `${slider}%` }} />
                        {[0, 25, 50, 75, 100].map((p) => (
                            <div key={p} className="absolute h-2.5 w-2.5 rounded-full border-2 border-background"
                                style={{ left: `calc(${p}% - 5px)`, backgroundColor: slider >= p ? "var(--color-primary)" : "var(--color-border)" }} />
                        ))}
                        <input
                            type="range" min={0} max={100} value={slider}
                            onChange={(e) => setQtyFromSlider(+e.target.value)}
                            className="absolute inset-x-0 opacity-0 h-6 cursor-pointer"
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground tabular mt-1">
                        <span>0</span><span>100%</span>
                    </div>
                </div>

                <FieldStack label="Order Value">
                    <NumberField value={orderValue} onChange={(v) => {
                        setOrderValue(v);
                        const val = parseFloat(v) || 0;
                        const p = parseFloat(price) || market.price;
                        setQty((val / p).toFixed(4));
                        setSlider(Math.min(100, (val / Math.max(avail, 1)) * 100));
                    }} suffix="$" />
                </FieldStack>

                {isPerp && (
                    <>
                        <CollapsibleRow k="Margin Required" v="—" />
                        <CollapsibleRow k="Est. Liquidation Price" v="—" />
                    </>
                )}

                <button onClick={submit}
                    className={`w-full h-10 rounded font-bold text-[13px] mt-1 ${side === "buy" ? "bg-up text-background hover:opacity-90" : "bg-down text-background hover:opacity-90"}`}>
                    {side === "buy" ? buyLabel : sellLabel}
                </button>

                <Link href="/signup" className="block w-full h-9 rounded bg-elevated text-center text-[12px] font-medium leading-9 text-muted-foreground hover:text-foreground">
                    Sign up to trade
                </Link>
                <Link href="/signin" className="block w-full h-9 rounded bg-elevated text-center text-[12px] font-medium leading-9 text-muted-foreground hover:text-foreground">
                    Log in to trade
                </Link>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 text-[11px]">
                    <CheckRow label="Post Only" checked={postOnly} onChange={setPostOnly} />
                    <CheckRow label="IOC" checked={ioc} onChange={setIoc} />
                    <CheckRow label="Reduce Only" checked={reduceOnly} onChange={setReduceOnly} />
                    <CheckRow label="TP/SL" checked={tpsl} onChange={setTpsl} />
                </div>
            </div>
        </div>
    );
}

function FieldStack({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground">{label}</span>
                {right}
            </div>
            {children}
        </div>
    );
}
function NumberField({ value, onChange, suffix, disabled }: { value: string; onChange: (v: string) => void; suffix?: string; disabled?: boolean }) {
    return (
        <div className={`flex items-center rounded border border-border bg-card h-10 ${disabled ? "opacity-60" : ""}`}>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="flex-1 bg-transparent text-[14px] tabular px-3 outline-none font-semibold"
                placeholder="0"
            />
            {suffix && <div className="h-6 w-6 rounded-full bg-elevated grid place-items-center text-[11px] mr-2">{suffix}</div>}
        </div>
    );
}
function ChipBtn({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
    return (
        <button onClick={onClick} className="px-1.5 py-0.5 text-[10px] rounded bg-elevated text-muted-foreground hover:text-foreground">
            {children}
        </button>
    );
}
function RowKV({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">{k}</span>
            <span className="tabular font-semibold">{v}</span>
        </div>
    );
}
function CollapsibleRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex items-center justify-between text-[12px] border-b border-border pb-1.5">
            <span className="text-muted-foreground flex items-center gap-1">{k} <ChevronDown className="h-3 w-3" /></span>
            <span className="tabular">{v}</span>
        </div>
    );
}
function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
    return (
        <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer hover:text-foreground">
            <span onClick={() => onChange(!checked)} className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${checked ? "bg-primary border-primary" : "border-border bg-card"}`}>
                {checked && <span className="h-1.5 w-1.5 bg-primary-foreground rounded-sm" />}
            </span>
            {label}
        </label>
    );
}

/* ---------- Bottom tables ---------- */
function OpenOrdersTable({ rows, onCancel }: { rows: OpenOrder[]; onCancel: (id: string) => void }) {
    if (!rows.length) return <Empty label="No open orders" />;
    return (
        <table className="w-full text-xs">
            <THead cols={["Time", "Market", "Side", "Type", "Price", "Amount", "Filled", "Status", ""]} />
            <tbody>
                {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-elevated/50">
                        <Td>{r.time}</Td>
                        <Td className="font-semibold">{r.market}</Td>
                        <Td className={r.side === "buy" ? "text-up" : "text-down"}>{r.side.toUpperCase()}</Td>
                        <Td>{r.type}</Td>
                        <Td className="tabular">{fmtPrice(r.price)}</Td>
                        <Td className="tabular">{r.amount}</Td>
                        <Td className="tabular">{r.filled}</Td>
                        <Td><span className="px-1.5 py-0.5 rounded bg-elevated text-[10px]">{r.status}</span></Td>
                        <Td><button onClick={() => onCancel(r.id)} className="text-down hover:underline">Cancel</button></Td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
function PositionsTable({ rows, includeStatus }: { rows: typeof POSITIONS; includeStatus?: boolean }) {
    if (!rows.length) return <Empty label="No positions" />;
    return (
        <table className="w-full text-xs">
            <THead cols={["Market", "Side", "Size", "Entry", "Mark", "Liq.", "Margin", "Lev.", "PnL", "ROE%", includeStatus ? "Status" : "", ""]} />
            <tbody>
                {rows.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-elevated/50">
                        <Td className="font-semibold">{p.market}</Td>
                        <Td className={p.side === "long" ? "text-up" : "text-down"}>{p.side.toUpperCase()}</Td>
                        <Td className="tabular">{p.size}</Td>
                        <Td className="tabular">{fmtPrice(p.entryPrice)}</Td>
                        <Td className="tabular">{fmtPrice(p.markPrice)}</Td>
                        <Td className="tabular text-muted-foreground">{fmtPrice(p.liqPrice)}</Td>
                        <Td className="tabular">{p.margin.toFixed(2)}</Td>
                        <Td>{p.leverage}x</Td>
                        <Td className={`tabular ${p.pnl >= 0 ? "text-up" : "text-down"}`}>{p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)}</Td>
                        <Td className={`tabular ${p.roe >= 0 ? "text-up" : "text-down"}`}>{fmtPct(p.roe)}</Td>
                        {includeStatus && <Td><span className={`px-1.5 py-0.5 rounded text-[10px] ${p.status === "open" ? "bg-up/20 text-up" : "bg-elevated text-muted-foreground"}`}>{p.status}</span></Td>}
                        <Td>{p.status === "open" && <button onClick={() => toast("Close position", { description: "Demo only" })} className="text-down hover:underline">Close</button>}</Td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
function OrderHistoryTable({ rows }: { rows: typeof ORDER_HISTORY }) {
    if (rows.length === 0) return <Empty label="Sign in to view order history" />;
    return (
        <table className="w-full text-xs">
            <THead cols={["Time", "Market", "Side", "Type", "Price", "Amount", "Filled", "Status"]} />
            <tbody>
                {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-elevated/50">
                        <Td>{r.time}</Td><Td className="font-semibold">{r.market}</Td>
                        <Td className={r.side === "buy" ? "text-up" : "text-down"}>{r.side.toUpperCase()}</Td>
                        <Td>{r.type}</Td><Td className="tabular">{fmtPrice(r.price)}</Td>
                        <Td className="tabular">{r.amount}</Td><Td className="tabular">{r.filled}</Td>
                        <Td>{r.status}</Td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
function TradeHistoryTable({ rows }: { rows: typeof TRADE_HISTORY }) {
    if (rows.length === 0) return <Empty label="Sign in to view fill history" />;
    return (
        <table className="w-full text-xs">
            <THead cols={["Time", "Market", "Side", "Price", "Amount", "Fee"]} />
            <tbody>
                {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-elevated/50">
                        <Td>{r.time}</Td><Td className="font-semibold">{r.market}</Td>
                        <Td className={r.side === "buy" ? "text-up" : "text-down"}>{r.side.toUpperCase()}</Td>
                        <Td className="tabular">{fmtPrice(r.price)}</Td>
                        <Td className="tabular">{r.amount}</Td>
                        <Td className="tabular">{r.fee.toFixed(2)}</Td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
function FundingTable({ rows }: { rows: typeof FUNDING_HISTORY }) {
    if (rows.length === 0) return <Empty label="Sign in to view funding history" />;
    return (
        <table className="w-full text-xs">
            <THead cols={["Time", "Market", "Rate", "Payment"]} />
            <tbody>
                {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-elevated/50">
                        <Td>{r.time}</Td><Td className="font-semibold">{r.market}</Td>
                        <Td className={`tabular ${r.rate >= 0 ? "text-up" : "text-down"}`}>{fmtPct(r.rate * 100)}</Td>
                        <Td className={`tabular ${r.payment >= 0 ? "text-up" : "text-down"}`}>{r.payment.toFixed(4)} USDT</Td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
function BalancesMiniTable() {
    if (BALANCES.length === 0) return <Empty label="Sign in to view balances" />;
    return (
        <table className="w-full text-xs">
            <THead cols={["Asset", "Total", "Available", "In Orders", "USD Value"]} />
            <tbody>
                {BALANCES.map((b) => (
                    <tr key={b.asset} className="border-t border-border hover:bg-elevated/50">
                        <Td className="font-semibold">{b.asset}</Td>
                        <Td className="tabular">{fmtAmount(b.total, 6)}</Td>
                        <Td className="tabular">{fmtAmount(b.available, 6)}</Td>
                        <Td className="tabular text-muted-foreground">{fmtAmount(b.inOrders, 6)}</Td>
                        <Td className="tabular">{fmtUsd(b.total * b.usdPrice)}</Td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
function THead({ cols }: { cols: string[] }) {
    return (
        <thead className="bg-elevated/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>{cols.map((c, i) => <th key={i} className="px-3 py-2 text-left whitespace-nowrap">{c}</th>)}</tr>
        </thead>
    );
}
function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <td className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}
function Empty({ label }: { label: string }) {
    return <div className="py-12 text-center text-muted-foreground text-sm">{label}</div>;
}
