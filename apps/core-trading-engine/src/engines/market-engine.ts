import { AddMarketType, Asset, BaseBalanceType, EVENT_REJECT_CODES, Market, MarketId, MarketsType, OrderId, UserPosition } from "@workspace/types";
import { RejectError } from "../utils/error";
import { SingleMarketOrderBook } from "./single-orderbook";

type MarketEngineDeps = {
    markets: MarketsType;
    orderbooks: Map<string, SingleMarketOrderBook>;
    positions: Map<string, UserPosition>;
    orderMap: Map<OrderId, MarketId>;
    assets: Map<string, Asset>;
    balances: Map<string, BaseBalanceType>;
};

export const baseAsset: Asset[] = [
    {
        symbol: "BTC",
        precision: 2,
        id: "BTC"
    },
    {
        symbol: "ETH",
        precision: 2,
        id: "ETH"
    },
    {
        symbol: "SOL",
        precision: 2,
        id: "SOL"
    }
]

export const quoteAsset: Asset[] = [
    {
        symbol: "INR",
        precision: 2,
        id: "INR"
    },
    {
        symbol: "USD",
        precision: 2,
        id: "USD"
    }
]

export const DEFAULT_QUOTE_ASSET_PERP = quoteAsset.find(a => a.symbol === "USD");

export class MarketEngine {


    constructor(private state: MarketEngineDeps) { }


    initializeMarkets() {
        // Prevent re-initialization if markets already exist
        if (this.state.markets.size > 0) return;

        for (const base of baseAsset) {
            this.state.assets.set(base.id, base);
        }
        for (const quote of quoteAsset) {
            if (quote.symbol !== "PERP") this.state.assets.set(quote.id, quote);
        }

        for (const base of baseAsset) {

            for (const quote of quoteAsset) {

                const marketName = `${base.symbol}_${quote.symbol}`;

                this.state.markets.set(marketName, {
                    id: marketName,
                    name: marketName,
                    baseAsset: base,
                    quoteAsset: quote,
                    maxLeverage: 50,
                    minQty: 1,
                    tickSize: 1,
                    lotSize: 1,
                    minNotional: 1,
                });

                this.state.positions.set(
                    marketName,
                    new Map()
                );

                const market = this.state.markets.get(marketName);

                if (!market) {
                    this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Failed to initialize market");
                }

                this.state.orderbooks.set(marketName, new SingleMarketOrderBook(market, this.state.orderMap));
            }

            // Create perp markets
            const marketName = `${base.symbol}_PERP`;

            this.state.markets.set(marketName, {
                id: marketName,
                name: marketName,
                baseAsset: base,
                quoteAsset: DEFAULT_QUOTE_ASSET_PERP!,
                maxLeverage: 50,
                minQty: 1,
                tickSize: 1,
                lotSize: 1,
                minNotional: 1,
            });
        }
    }

    getMarkets(): Record<string, Market> {
        return Object.fromEntries(this.state.markets);
    }

    getAssets(): Record<string, Asset> {
        return Object.fromEntries(this.state.assets);
    }

    getMarketById(marketId: MarketId): Market {
        const market = this.state.markets.get(marketId);
        if (!market) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Market not found");
        }
        return market;
    }

    updateMarket(marketId: MarketId, marketData: Partial<Market>): Market {
        const market = this.getMarketById(marketId);
        const updatedMarket = { ...market, ...marketData };
        this.state.markets.set(marketId, updatedMarket);
        return updatedMarket;
    }

    addMarket(marketData: AddMarketType) {
        if (this.state.markets.has(marketData.id)) {
            this.reject(EVENT_REJECT_CODES.MARKET_ALREADY_EXISTS, "Market already exists");
        }

        const selectedBase = this.state.assets.get(marketData.baseAssetId);
        const selectedQuote = this.state.assets.get(marketData.quoteAssetId);

        if (!selectedBase || !selectedQuote) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Invalid base or quote asset");
        }

        const newMarket: Market = {
            ...marketData,
            baseAsset: selectedBase,
            quoteAsset: selectedQuote
        }

        this.state.markets.set(marketData.id, newMarket);

        this.state.positions.set(marketData.id, new Map());
        this.state.orderbooks.set(marketData.id, new SingleMarketOrderBook(newMarket, this.state.orderMap));
    }

    deleteMarket(marketId: MarketId) {
        const market = this.getMarketById(marketId);
        if (!this.state.markets.has(market.id)) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Market not found");
        }

        const orderbook = this.state.orderbooks.get(market.id);
        if (orderbook) {
            if (orderbook.asks.size > 0 || orderbook.bids.size > 0) {
                this.reject(EVENT_REJECT_CODES.MARKET_NOT_EMPTY, "Market has open orders");
            } else {
                this.state.orderbooks.delete(market.id);
            }
        }

        if (this.state.positions.has(market.id)) {
            const marketPositions = this.state.positions.get(market.id);
            if (marketPositions && marketPositions.size > 0) {
                this.reject(EVENT_REJECT_CODES.MARKET_NOT_EMPTY, "Market has open positions");
            } else {
                this.state.positions.delete(market.id);
            }
        }

        if (this.state.balances.size > 0) {
            for (const [userId, balances] of this.state.balances.entries()) {
                const baseBalance = balances.get(market.baseAsset.id);
                const quoteBalance = balances.get(market.quoteAsset.id);
                if ((baseBalance && baseBalance.total > 0n) || (quoteBalance && quoteBalance.total > 0n)) {
                    this.reject(EVENT_REJECT_CODES.MARKET_NOT_EMPTY, "Market has user balances");
                } else {
                    if (baseBalance) {
                        balances.delete(market.baseAsset.id);
                    }
                    if (quoteBalance) {
                        balances.delete(market.quoteAsset.id);
                    }
                }
            }
        }

        this.state.markets.delete(market.id);
    }

    addMarketAsset(asset: Asset, assetSide: "base" | "quote") {
        this.state.assets.forEach(a => {
            if (a.symbol === asset.symbol) {
                this.reject(EVENT_REJECT_CODES.ASSET_ALREADY_EXISTS, "Asset already exists");
            }
        })

        if (assetSide === "base") {
            baseAsset.push(asset);
            this.state.assets.set(asset.id, asset);
        } else {
            quoteAsset.push(asset);
            this.state.assets.set(asset.id, asset);
        }

        this.state.balances.forEach(userBalance => userBalance.set(asset.id, { total: 0n, locked: 0n }))

    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }

}
