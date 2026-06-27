import { DepthB, KlinesB, MarketB, MarkPriceB, OpenInterestB, TickerB, TradesB } from "@workspace/types"
import axios from "axios";

const BACKEND_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:8082/api/backpack/api/v1";

const toNumber = (value: string) => Number(value);

export async function getTickers(): Promise<TickerB[]> {
    const response = await axios.get<TickerB[]>(`${BACKEND_URL}/tickers`);
    return response.data;
}

export async function getMarkets(): Promise<MarketB[]> {
    const { data } = await axios.get<MarketB[]>(`${BACKEND_URL}/markets`);
    return data;
}

export async function getMarkPrices(): Promise<MarkPriceB[]> {
    const { data } = await axios.get<MarkPriceB[]>(`${BACKEND_URL}/markPrices`);
    return data;
}

export async function getOpenInterest(): Promise<OpenInterestB[]> {
    const { data } = await axios.get<OpenInterestB[]>(`${BACKEND_URL}/openInterest`);
    return data;
}

export async function getMarketDepth(symbol: string): Promise<DepthB> {
    const { data } = await axios.get<DepthB>(`${BACKEND_URL}/depth`, { params: { symbol } });
    return data;
}

export async function getCurrentMarketData(symbol: string, limit: number) {
    const openInterestRequest = symbol.endsWith("_PERP")
        ? axios.get<OpenInterestB[]>(`${BACKEND_URL}/openInterest`, { params: { symbol } })
            .then(({ data }) => data.find((item) => item.symbol === symbol) ?? null)
        : Promise.resolve(null);

    const [tickerResponse, marketResponse, tradesResponse, depthResponse, markPricesResponse, openInterest] = await Promise.all([
        axios.get<TickerB>(`${BACKEND_URL}/ticker`, { params: { symbol } }),
        axios.get<MarketB>(`${BACKEND_URL}/market`, { params: { symbol } }),
        axios.get<TradesB[]>(`${BACKEND_URL}/trades`, { params: { symbol, limit } }),
        axios.get<DepthB>(`${BACKEND_URL}/depth`, { params: { symbol } }),
        axios.get<MarkPriceB[]>(`${BACKEND_URL}/markPrices`),
        openInterestRequest,
    ]);

    return {
        ticker: tickerResponse.data,
        market: marketResponse.data,
        trades: tradesResponse.data,
        depth: depthResponse.data,
        markPrice: markPricesResponse.data.find((item) => item.symbol === symbol) ?? null,
        openInterest,
    };
}

export async function getMarketKLines(symbol: string, interval: string, startTime: number, endTime?: number) {
    const { data } = await axios.get<KlinesB[]>(`${BACKEND_URL}/klines`, {
        params: { symbol, interval, startTime, ...(endTime === undefined ? {} : { endTime }) },
    });
    return data;
}

export function seperateSpotMarkets(tickers: TickerB[]): TickerB[] {
    const spot = tickers.filter((t: TickerB) => t.symbol.split('_').length <= 2);
    return spot;
}

export function seperateFuturesMarkets(tickers: TickerB[]): TickerB[] {
    const futures = tickers.filter((t: TickerB) => t.symbol.split('_').length > 2);
    return futures;
}

export function trendingMarkets(tickers: TickerB[]): TickerB[] {
    return [...tickers]
        .sort((a, b) => toNumber(b.trades) - toNumber(a.trades))
}

export function topGainersMarkets(tickers: TickerB[]): TickerB[] {
    return [...tickers]
        .sort(
            (a, b) =>
                toNumber(b.priceChangePercent) -
                toNumber(a.priceChangePercent)
        )
}

export function topLosersMarkets(tickers: TickerB[]): TickerB[] {
    return [...tickers]
        .sort(
            (a, b) =>
                toNumber(a.priceChangePercent) -
                toNumber(b.priceChangePercent)
        )
}

export function favoriteMarkets(tickers: TickerB[], symbols: string[]): TickerB[] {
    const favorites = new Set(symbols);
    return tickers.filter((ticker) => favorites.has(ticker.symbol));
}

export function highestVolumeMarkets(tickers: TickerB[]): TickerB[] {
    return [...tickers]
        .sort(
            (a, b) =>
                toNumber(b.quoteVolume) -
                toNumber(a.quoteVolume)
        );
}

export function recentlyListedMarkets(tickers: TickerB[], markets: MarketB[]): TickerB[] {
    const createdAtMap = new Map(
        markets.map((m) => [m.symbol, new Date(m.createdAt).getTime()])
    );

    return [...tickers]
        .filter((t) => createdAtMap.has(t.symbol))
        .sort(
            (a, b) =>
                (createdAtMap.get(b.symbol) ?? 0) -
                (createdAtMap.get(a.symbol) ?? 0)
        )
        .slice(0, 5);
}
