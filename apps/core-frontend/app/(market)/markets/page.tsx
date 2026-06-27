"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
    ArrowDown,
    ArrowUp,
    Flame,
    RefreshCw,
    Search,
    Sparkles,
    Star,
    TrendingUp,
    type LucideIcon,
} from "lucide-react";
import type { MarketB, MarkPriceB, OpenInterestB, TickerB } from "@workspace/types";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { fmtCompact, fmtPct, fmtPrice } from "@/lib/format";
import {
    favoriteMarkets,
    getMarkPrices,
    getMarkets,
    getOpenInterest,
    getTickers,
    highestVolumeMarkets,
    recentlyListedMarkets,
    seperateFuturesMarkets,
    seperateSpotMarkets,
    topGainersMarkets,
    topLosersMarkets,
    trendingMarkets,
} from "@/utils/http-client";
import Image from "next/image";
import {
    subscribeBatched,
    tickerFromWs,
    wsStreams,
    type BackpackPublicEvent,
} from "@/utils/ws-client";

type Tab = "all" | "spot" | "perp" | "favorites" | "new" | "gainers" | "losers";
type MarketFilter = "all" | "spot" | "perp";
type SortKey = "symbol" | "price" | "change" | "volume" | "funding" | "oi";

const numberValue = (value: string) => Number(value) || 0;
const isPerp = (ticker: TickerB) => ticker.symbol.endsWith("_PERP");
const symbolParts = (symbol: string) => {
    const [base = symbol, quote = "", suffix] = symbol.split("_");
    return { base, quote, display: suffix === "PERP" ? `${base}-${quote}` : `${base}/${quote}` };
};
const requestMarketData = () => Promise.all([getTickers(), getMarkets(), getMarkPrices(), getOpenInterest()]);

export default function MarketsPage() {
    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [quote, setQuote] = useState("all");
    const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [hideLowVol, setHideLowVol] = useState(false);
    const [favOnly, setFavOnly] = useState(false);
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "volume", dir: "desc" });
    const [tickers, setTickers] = useState<TickerB[]>([]);
    const [markets, setMarkets] = useState<MarketB[]>([]);
    const [markPrices, setMarkPrices] = useState<MarkPriceB[]>([]);
    const [openInterest, setOpenInterest] = useState<OpenInterestB[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [tickerData, marketData, markPriceData, openInterestData] = await requestMarketData();
            setTickers(tickerData);
            setMarkets(marketData);
            setMarkPrices(markPriceData);
            setOpenInterest(openInterestData);
        } catch (fetchError) {
            console.error("Error fetching market data:", fetchError);
            setError("Market data is temporarily unavailable. Check that the proxy server is running, then retry.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        requestMarketData()
            .then(([tickerData, marketData, markPriceData, openInterestData]) => {
                if (cancelled) return;
                setTickers(tickerData);
                setMarkets(marketData);
                setMarkPrices(markPriceData);
                setOpenInterest(openInterestData);
            })
            .catch((fetchError: unknown) => {
                if (cancelled) return;
                console.error("Error fetching market data:", fetchError);
                setError("Market data is temporarily unavailable. Check that the proxy server is running, then retry.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const toggleFav = (symbol: string) => {
        setFavorites((previous) => {
            const next = new Set(previous);
            if (next.has(symbol)) next.delete(symbol);
            else next.add(symbol);
            return next;
        });
    };

    const quoteOptions = useMemo(
        () => [...new Set(tickers.map((ticker) => symbolParts(ticker.symbol).quote).filter(Boolean))].sort(),
        [tickers],
    );
    const markPriceBySymbol = useMemo(() => new Map(markPrices.map((item) => [item.symbol, item])), [markPrices]);
    const openInterestBySymbol = useMemo(() => new Map(openInterest.map((item) => [item.symbol, item])), [openInterest]);
    const tickerSymbolsKey = useMemo(() => tickers.map((ticker) => ticker.symbol).sort().join(","), [tickers]);

    useEffect(() => {
        if (!tickerSymbolsKey) return;
        const symbols = tickerSymbolsKey.split(",");
        const perpetualSymbols = symbols.filter((symbol) => symbol.endsWith("_PERP"));
        const streams = [
            ...symbols.map(wsStreams.ticker),
            ...perpetualSymbols.map(wsStreams.markPrice),
            ...perpetualSymbols.map(wsStreams.openInterest),
        ];

        return subscribeBatched<BackpackPublicEvent>(streams, (events) => {
            const tickerUpdates = new Map(events.filter((event) => event.e === "ticker").map((event) => [event.s, tickerFromWs(event)]));
            if (tickerUpdates.size > 0) {
                setTickers((current) => current.map((ticker) => tickerUpdates.get(ticker.symbol) ?? ticker));
            }

            const markPriceUpdates = events.filter((event) => event.e === "markPrice");
            if (markPriceUpdates.length > 0) {
                setMarkPrices((current) => {
                    const next = new Map(current.map((item) => [item.symbol, item]));
                    for (const event of markPriceUpdates) {
                        next.set(event.s, {
                            symbol: event.s,
                            markPrice: event.p,
                            fundingRate: event.f ?? "0",
                            indexPrice: event.i ?? event.p,
                            nextFundingTimestamp: event.n ?? 0,
                        });
                    }
                    return [...next.values()];
                });
            }

            const openInterestUpdates = events.filter((event) => event.e === "openInterest");
            if (openInterestUpdates.length > 0) {
                setOpenInterest((current) => {
                    const next = new Map(current.map((item) => [item.symbol, item]));
                    for (const event of openInterestUpdates) {
                        next.set(event.s, { symbol: event.s, openInterest: event.o, timestamp: Math.floor(event.E / 1_000) });
                    }
                    return [...next.values()];
                });
            }
        });
    }, [tickerSymbolsKey]);

    const filtered = useMemo(() => {
        let list = [...tickers];
        if (tab === "spot") list = seperateSpotMarkets(list);
        else if (tab === "perp") list = seperateFuturesMarkets(list);
        else if (tab === "favorites") list = favoriteMarkets(list, [...favorites]);
        else if (tab === "new") list = recentlyListedMarkets(list, markets);
        else if (tab === "gainers") list = topGainersMarkets(list).filter((ticker) => numberValue(ticker.priceChangePercent) > 0);
        else if (tab === "losers") list = topLosersMarkets(list).filter((ticker) => numberValue(ticker.priceChangePercent) < 0);

        if (marketFilter === "spot") list = seperateSpotMarkets(list);
        if (marketFilter === "perp") list = seperateFuturesMarkets(list);
        if (quote !== "all") list = list.filter((ticker) => symbolParts(ticker.symbol).quote === quote);
        if (hideLowVol) list = list.filter((ticker) => numberValue(ticker.quoteVolume) >= 100_000);
        if (favOnly) list = favoriteMarkets(list, [...favorites]);
        if (search.trim()) {
            const query = search.trim().toLowerCase();
            list = list.filter((ticker) => ticker.symbol.toLowerCase().includes(query));
        }

        const direction = sort.dir === "asc" ? 1 : -1;
        return [...list].sort((a, b) => {
            if (sort.key === "symbol") return a.symbol.localeCompare(b.symbol) * direction;
            const values: Record<Exclude<SortKey, "symbol">, [number, number]> = {
                price: [numberValue(a.lastPrice), numberValue(b.lastPrice)],
                change: [numberValue(a.priceChangePercent), numberValue(b.priceChangePercent)],
                volume: [numberValue(a.quoteVolume), numberValue(b.quoteVolume)],
                funding: [numberValue(markPriceBySymbol.get(a.symbol)?.fundingRate ?? "0"), numberValue(markPriceBySymbol.get(b.symbol)?.fundingRate ?? "0")],
                oi: [numberValue(openInterestBySymbol.get(a.symbol)?.openInterest ?? "0"), numberValue(openInterestBySymbol.get(b.symbol)?.openInterest ?? "0")],
            };
            const [left, right] = values[sort.key];
            return (left - right) * direction;
        });
    }, [favorites, favOnly, hideLowVol, marketFilter, markets, markPriceBySymbol, openInterestBySymbol, quote, search, sort, tab, tickers]);

    const trending = useMemo(() => trendingMarkets(tickers).slice(0, 5), [tickers]);
    const recent = useMemo(() => recentlyListedMarkets(tickers, markets), [markets, tickers]);
    const highVolume = useMemo(() => highestVolumeMarkets(tickers).slice(0, 5), [tickers]);

    const setSortKey = (key: SortKey) => {
        setSort((current) => current.key === key
            ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
            : { key, dir: key === "symbol" ? "asc" : "desc" });
    };

    const clearFilters = () => {
        setSearch("");
        setQuote("all");
        setMarketFilter("all");
        setHideLowVol(false);
        setFavOnly(false);
        setTab("all");
    };

    const tabs: { key: Tab; label: string }[] = [
        { key: "all", label: "All" },
        { key: "spot", label: "Spot" },
        { key: "perp", label: "Perpetuals" },
        { key: "favorites", label: "★ Favorites" },
        { key: "new", label: "Recently Listed" },
        { key: "gainers", label: "Top Gainers" },
        { key: "losers", label: "Top Losers" },
    ];

    return (
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6">
            <div className="flex items-end justify-between mb-5 gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Markets</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {loading ? "Loading live markets…" : `${tickers.length} live markets · Backpack 24h snapshot`}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refreshData()} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="grid lg:grid-cols-[1fr_300px] gap-6">
                <div>
                    <div className="flex flex-wrap gap-1 border-b border-border mb-4">
                        {tabs.map((item) => (
                            <button
                                key={item.key}
                                onClick={() => setTab(item.key)}
                                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input className="pl-8 h-9 bg-card" placeholder="Search symbol…" value={search} onChange={(event) => setSearch(event.target.value)} />
                        </div>
                        <SelectValueField value={quote} onChange={setQuote} options={[["all", "All Quote"], ...quoteOptions.map((item) => [item, item] as [string, string])]} />
                        <SelectValueField value={marketFilter} onChange={(value) => setMarketFilter(value as MarketFilter)} options={[["all", "All Types"], ["spot", "Spot"], ["perp", "Perpetual"]]} />
                        <Toggle value={hideLowVol} onChange={setHideLowVol} label="Hide low volume" />
                        <Toggle value={favOnly} onChange={setFavOnly} label="Favorites only" />
                        <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearFilters}>Clear</Button>
                    </div>

                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-elevated/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
                                    <tr>
                                        <th className="w-8 px-3 py-2.5" />
                                        <Th onClick={() => setSortKey("symbol")} active={sort.key === "symbol"} dir={sort.dir}>Market</Th>
                                        <th className="px-3 py-2.5 text-left">Type</th>
                                        <Th onClick={() => setSortKey("price")} active={sort.key === "price"} dir={sort.dir} align="right">Last Price</Th>
                                        <Th onClick={() => setSortKey("change")} active={sort.key === "change"} dir={sort.dir} align="right">24h Change</Th>
                                        <th className="px-3 py-2.5 text-right">24h High</th>
                                        <th className="px-3 py-2.5 text-right">24h Low</th>
                                        <Th onClick={() => setSortKey("volume")} active={sort.key === "volume"} dir={sort.dir} align="right">Volume</Th>
                                        <Th onClick={() => setSortKey("funding")} active={sort.key === "funding"} dir={sort.dir} align="right">Funding</Th>
                                        <Th onClick={() => setSortKey("oi")} active={sort.key === "oi"} dir={sort.dir} align="right">OI</Th>
                                        <th className="px-3 py-2.5" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {!loading && filtered.length === 0 && (
                                        <tr><td colSpan={11} className="text-center py-16 text-muted-foreground">No markets match these filters.</td></tr>
                                    )}
                                    {loading && tickers.length === 0 && (
                                        <tr><td colSpan={11} className="text-center py-16 text-muted-foreground">Fetching the latest market snapshot…</td></tr>
                                    )}
                                    {filtered.map((ticker) => (
                                        <MarketRow
                                            key={ticker.symbol}
                                            ticker={ticker}
                                            markPrice={markPriceBySymbol.get(ticker.symbol)}
                                            openInterest={openInterestBySymbol.get(ticker.symbol)}
                                            favorite={favorites.has(ticker.symbol)}
                                            onFavorite={() => toggleFav(ticker.symbol)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <aside className="space-y-4">
                    <SidebarCard title="Trending by Trades" icon={Flame}>
                        {trending.map((ticker) => <SidebarRow key={ticker.symbol} ticker={ticker} />)}
                    </SidebarCard>
                    <SidebarCard title="Recently Listed" icon={Sparkles}>
                        {recent.length > 0
                            ? recent.map((ticker) => <SidebarRow key={ticker.symbol} ticker={ticker} />)
                            : <div className="text-xs text-muted-foreground px-1 py-2">No listing metadata available.</div>}
                    </SidebarCard>
                    <SidebarCard title="Highest Volume" icon={TrendingUp}>
                        {highVolume.map((ticker) => <SidebarRow key={ticker.symbol} ticker={ticker} />)}
                    </SidebarCard>
                </aside>
            </div>
        </div>
    );
}

function MarketRow({ ticker, markPrice, openInterest, favorite, onFavorite }: { ticker: TickerB; markPrice?: MarkPriceB; openInterest?: OpenInterestB; favorite: boolean; onFavorite: () => void }) {
    const { base, quote, display } = symbolParts(ticker.symbol);
    const change = numberValue(ticker.priceChangePercent) * 100;
    const perpetual = isPerp(ticker);

    return (
        <tr className="border-t border-border hover:bg-elevated/50 group">
            <td className="px-3 py-3">
                <button onClick={onFavorite} aria-label={`${favorite ? "Remove" : "Add"} ${display} ${favorite ? "from" : "to"} favorites`}>
                    <Star className={`h-4 w-4 ${favorite ? "fill-primary text-primary" : "text-muted-foreground hover:text-primary"}`} />
                </button>
            </td>
            <td className="px-3 py-3">
                <Link href={`/trade?symbol=${encodeURIComponent(ticker.symbol)}`} className="flex items-center gap-2.5">
                    <Image
                        src={`https://backpack.exchange/coins/${base.toLocaleLowerCase()}.png`}
                        alt={`${base} Logo`}
                        width={30}
                        height={30}
                        className="z-10 mr-5 rounded-full"
                    />
                    <div>
                        <div className="font-semibold">{display}</div>
                        <div className="text-[11px] text-muted-foreground">Quoted in {quote}</div>
                    </div>
                </Link>
            </td>
            <td className="px-3 py-3">
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${perpetual ? "bg-primary/15 text-primary" : "bg-elevated text-muted-foreground"}`}>
                    {perpetual ? "perp" : "spot"}
                </span>
            </td>
            <td className="px-3 py-3 text-right tabular font-medium">{fmtPrice(numberValue(ticker.lastPrice))}</td>
            <td className={`px-3 py-3 text-right tabular ${change >= 0 ? "text-up" : "text-down"}`}>
                <span className="inline-flex items-center justify-end gap-0.5">
                    {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {fmtPct(change, false)}
                </span>
            </td>
            <td className="px-3 py-3 text-right tabular text-muted-foreground">{fmtPrice(numberValue(ticker.high))}</td>
            <td className="px-3 py-3 text-right tabular text-muted-foreground">{fmtPrice(numberValue(ticker.low))}</td>
            <td className="px-3 py-3 text-right tabular">{fmtCompact(numberValue(ticker.quoteVolume))}</td>
            <td className={`px-3 py-3 text-right tabular ${numberValue(markPrice?.fundingRate ?? "0") >= 0 ? "text-up" : "text-down"}`}>
                {markPrice ? fmtPct(numberValue(markPrice.fundingRate) * 100) : "—"}
            </td>
            <td className="px-3 py-3 text-right tabular text-muted-foreground">
                {openInterest ? `${fmtCompact(numberValue(openInterest.openInterest))}` : "—"}
            </td>
            <td className="px-3 py-3 text-right">
                <Button asChild size="sm" className="h-7 bg-primary hover:bg-brand-active text-primary-foreground text-xs font-semibold">
                    <Link href={`/trade?symbol=${encodeURIComponent(ticker.symbol)}`}>Trade</Link>
                </Button>
            </td>
        </tr>
    );
}

function Th({ children, onClick, active, dir, align = "left" }: { children: ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc"; align?: "left" | "right" }) {
    return (
        <th className={`px-3 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
            <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
                {children} {active && (dir === "asc" ? "▲" : "▼")}
            </button>
        </th>
    );
}

function SelectValueField({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-9 w-fit min-w-[140px] rounded-md border border-border bg-card px-2.5 text-sm focus:ring-1 focus:ring-primary"><SelectValue /></SelectTrigger>
            <SelectContent className="border-border bg-card">
                {options.map(([optionValue, label]) => <SelectItem key={optionValue} value={optionValue}>{label}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
    return (
        <button onClick={() => onChange(!value)} className={`h-9 px-3 rounded-md border text-sm font-medium transition-colors ${value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
            {label}
        </button>
    );
}

function SidebarCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{title}</h3>
            </div>
            <div className="px-4 py-2">{children}</div>
        </div>
    );
}

function SidebarRow({ ticker }: { ticker: TickerB }) {
    const { base, display } = symbolParts(ticker.symbol);
    const change = numberValue(ticker.priceChangePercent) * 100;
    return (
        <Link href={`/trade?symbol=${encodeURIComponent(ticker.symbol)}`} className="flex items-center justify-between gap-3 py-2 hover:opacity-80">
            <div className="flex min-w-0 items-center gap-2">
                <Image
                    src={`https://backpack.exchange/coins/${base.toLocaleLowerCase()}.png`}
                    alt={`${base} Logo`}
                    width={30}
                    height={30}
                    className="z-10 mr-5 rounded-full"
                />
                <span className="truncate text-sm font-semibold">{display}</span>
            </div>
            <div className="shrink-0 text-right tabular">
                <div className="text-sm">{fmtPrice(numberValue(ticker.lastPrice))}</div>
                <div className={`text-[11px] ${change >= 0 ? "text-up" : "text-down"}`}>{fmtPct(change)}</div>
            </div>
        </Link>
    );
}
