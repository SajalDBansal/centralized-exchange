import { AddMarketType, Asset, BaseBalanceType, EVENT_REJECT_CODES, FundingSettlePayload, InMarketOrderType, IndexPriceUpdatePayload, Market, MarketFunds, MarketId, MarketRiskStates, MarketsType, OrderId } from "@workspace/types";
import { RejectError } from "../utils/error";
import { formatBigInt, parseBigInt } from "../utils/parse-incoming";
import type { BalanceEngine } from "./balance-engine";
import type { Position } from "./position-engine";
import { SingleMarketPositions } from "./single-market-positions";
import { SingleMarketOrderBook } from "./single-orderbook";

type MarketEngineDeps = {
    markets: MarketsType;
    orderbooks: Map<string, SingleMarketOrderBook>;
    positions: Map<string, SingleMarketPositions>;
    orderMap: Map<OrderId, MarketId>;
    assets: Map<string, Asset>;
    balances: Map<string, BaseBalanceType>;
    orders: Map<OrderId, InMarketOrderType>;
    marketRisk: MarketRiskStates;
    insuranceFunds: MarketFunds;
    commissionFunds: MarketFunds;
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


    constructor(
        private state: MarketEngineDeps,
        private readonly balanceEngine: BalanceEngine,
        private readonly positionEngine: Position
    ) { }


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

                const market = this.state.markets.get(marketName);

                if (!market) {
                    this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Failed to initialize market");
                }

                this.positionEngine.initializeMarket(market);
                this.state.orderbooks.set(marketName, new SingleMarketOrderBook(market, this.state.orderMap, this.state.orders, this.balanceEngine));
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

            const perpMarket = this.state.markets.get(marketName);

            if (!perpMarket) {
                this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Failed to initialize perp market");
            }

            this.positionEngine.initializeMarket(perpMarket);
            this.state.orderbooks.set(marketName, new SingleMarketOrderBook(perpMarket, this.state.orderMap, this.state.orders, this.balanceEngine));
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

    onIndexPriceUpdate(payload: IndexPriceUpdatePayload) {
        const market = this.getMarketById(payload.marketId);
        const indexPrice = this.parsePrice(payload.indexPrice, market, "index price");
        const risk = this.getOrCreateRiskState(payload.marketId);
        risk.indexPrice = indexPrice;
        risk.indexUpdatedAt = payload.timestamp;

        return {
            marketId: payload.marketId,
            indexPrice: formatBigInt(indexPrice, market.quoteAsset.precision),
            liquidatablePositions: this.positionEngine.getLiquidatablePositions(payload.marketId, indexPrice),
        };
    }

    onFundingSettle(payload: FundingSettlePayload) {
        const market = this.getMarketById(payload.marketId);
        const indexPrice = this.parsePrice(payload.indexPrice, market, "index price");
        const markPrice = this.parsePrice(payload.markPrice, market, "mark price");

        if (!Number.isInteger(payload.intervalSeconds) || payload.intervalSeconds <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_AMOUNT, "Invalid funding interval");
        }

        const risk = this.getOrCreateRiskState(payload.marketId);
        const premiumBps = ((indexPrice - markPrice) * 10_000n) / indexPrice;
        const intervalRateBps = (premiumBps * BigInt(payload.intervalSeconds)) / 3_600n;
        const fundingRateBps = this.clamp(intervalRateBps, -1n, 1n);
        const result = this.positionEngine.applyFunding(payload.marketId, fundingRateBps, Date.now());
        risk.indexPrice = indexPrice;
        risk.indexUpdatedAt = Date.now();
        risk.lastFundingRateBps = fundingRateBps;
        risk.lastFundingSettledAt = Date.now();

        return {
            marketId: payload.marketId,
            indexPrice,
            ...result,
            liquidatablePositions: this.positionEngine.getLiquidatablePositions(payload.marketId, indexPrice),
        };
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

        this.positionEngine.initializeMarket(newMarket);
        this.state.orderbooks.set(marketData.id, new SingleMarketOrderBook(newMarket, this.state.orderMap, this.state.orders, this.balanceEngine));
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
                this.positionEngine.deleteMarket(market.id);
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
        this.state.marketRisk.delete(market.id);
        this.state.insuranceFunds.delete(market.id);
        this.state.commissionFunds.delete(market.id);
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

    private getOrCreateRiskState(marketId: MarketId) {
        let risk = this.state.marketRisk.get(marketId);

        if (!risk) {
            risk = {
                indexPrice: 0n,
                indexUpdatedAt: 0,
                lastFundingRateBps: 0n,
                lastFundingSettledAt: 0,
            };
            this.state.marketRisk.set(marketId, risk);
        }

        return risk;
    }

    private parsePrice(value: string, market: Market, field: string) {
        const price = parseBigInt(value, market.quoteAsset.precision, EVENT_REJECT_CODES.INVALID_PRICE, field);

        if (price <= 0n) {
            this.reject(EVENT_REJECT_CODES.INVALID_PRICE, `${field} must be positive`);
        }

        return price;
    }

    private clamp(value: bigint, min: bigint, max: bigint) {
        return value < min ? min : value > max ? max : value;
    }

}
