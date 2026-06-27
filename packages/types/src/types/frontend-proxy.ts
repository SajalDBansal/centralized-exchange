export interface TickerB {
    "firstPrice": string,
    "high": string,
    "lastPrice": string,
    "low": string,
    "priceChange": string,
    "priceChangePercent": string,
    "quoteVolume": string,
    "symbol": string,
    "trades": string,
    "volume": string
}

export type MarketB = {
    baseSymbol: string;
    createdAt: string; // ISO date string

    filters: {
        price: {
            borrowEntryFeeMaxMultiplier: string;
            borrowEntryFeeMinMultiplier: string;
            maxImpactMultiplier: string;
            maxMultiplier: string;
            maxPrice: string | null;
            maxPriceUpdateMultiplier: string | null;
            meanMarkPriceBand: { maxMultiplier: string; minMultiplier: string } | null;
            meanPremiumBand: { tolerancePct: string } | null;
            minImpactMultiplier: string;
            minMultiplier: string;
            minPrice: string;
            minPriceUpdateMultiplier: string | null;
            tickSize: string;
        };

        quantity: {
            maxQuantity: string | null;
            minQuantity: string;
            stepSize: string;
        };
    };

    fundingInterval: number | null;
    fundingRateLowerBound: string | null;
    fundingRateUpperBound: string | null;

    imfFunction: { base: string; factor: string; type: string } | null;
    marketType: "SPOT" | "PERP";
    mmfFunction: { base: string; factor: string; type: string } | null;

    openInterestLimit: string;
    orderBookState: string;
    positionLimitWeight: string | null;

    quoteSymbol: string;
    symbol: string;
    visible: boolean;
};

export type MarkPriceB = {
    symbol: string;
    fundingRate: string;
    indexPrice: string;
    markPrice: string;
    nextFundingTimestamp: number;
}

export type TradesB = {
    id: number;
    isBuyerMaker: boolean;
    price: string;
    quantity: string;
    quoteQuantity: string;
    timestamp: number; // Unix timestamp in milliseconds
}

type OrderBookLevel = [
    price: string,
    quantity: string
];

export type DepthB = {
    asks: OrderBookLevel[];
    bids: OrderBookLevel[];
    lastUpdateId: string;
    timestamp: number;
}

export type KlinesB = {
    close: string;
    end: string;
    high: string;
    low: string;
    open: string;
    quoteVolume: string;
    start: string;
    trades: string;
    volume: string;
}

export type OpenInterestB = {
    symbol: string;
    openInterest: string;
    timestamp: number;
}
