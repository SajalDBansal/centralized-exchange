import { AssetOrderbookType, BalancesType, BaseBalanceType, EVENT_REJECT_CODES, Market, MarketId, MarketsType, OrderBookType, OrderId, OrderList, OrderNode, PositionsType, UserId, UserPosition } from "@workspace/types";
import { RejectError } from "../utils/error";
import createRBTree from "functional-red-black-tree";

type ReadonlyEngineState = {

    readonly balances: ReadonlyMap<string, BaseBalanceType>;

    readonly orderMap: ReadonlyMap<OrderId, MarketId>;
};

type MarketEngineDeps = ReadonlyEngineState & {
    markets: MarketsType; // mutable
    orderbooks: Map<string, AssetOrderbookType>;
    positions: Map<string, UserPosition>;
};

export const baseAsset: string[] = ["BTC", "ETH", "SOL"];
export const quoteAsset: string[] = ["USD", "INR", "PERP"];

export class MarketEngine {

    constructor(private state: MarketEngineDeps) { }


    initializeMarkets() {

        for (const base of baseAsset) {

            for (const quote of quoteAsset) {

                const marketId = `${base}_${quote}`;

                this.state.markets.set(marketId, {
                    id: marketId,
                    name: marketId,
                    baseAsset: base,
                    quoteAsset: quote,
                    precision: 0,
                    maxLeverage: 50,
                    minQty: 1,
                    tickSize: 1,
                    lotSize: 1,
                    minNotional: 1,
                });

                this.state.positions.set(
                    marketId,
                    new Map()
                );

                this.state.orderbooks.set(marketId, {
                    market: marketId,
                    tickSize: 1,
                    lotSize: 1,
                    bids: new Map<bigint, OrderList>(),
                    asks: new Map<bigint, OrderList>(),
                    bidTree: createRBTree<bigint, boolean>(),
                    askTree: createRBTree<bigint, boolean>(),
                    orderMap: new Map<OrderId, OrderNode>(),
                    userOrders: new Map<UserId, Set<OrderId>>(),
                    lastTradePrice: 0n,
                    indexPrice: 0n,
                });
            }
        }
    }


    getMarkets(): Record<string, Market> {
        return Object.fromEntries(this.state.markets);
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

    addMarket(marketData: Market) {
        if (this.state.markets.has(marketData.id)) {
            this.reject(EVENT_REJECT_CODES.MARKET_ALREADY_EXISTS, "Market already exists");
        }

        if (!baseAsset.includes(marketData.baseAsset) || !quoteAsset.includes(marketData.quoteAsset)) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Invalid base or quote asset");
        }

        this.state.markets.set(marketData.id, marketData);
    }

    // TODO: add check to see if there are any open positions/orders in the market before deleting
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
                const baseBalance = balances.get(market.baseAsset);
                const quoteBalance = balances.get(market.quoteAsset);
                if ((baseBalance && baseBalance.total > 0n) || (quoteBalance && quoteBalance.total > 0n)) {
                    this.reject(EVENT_REJECT_CODES.MARKET_NOT_EMPTY, "Market has user balances");
                } else {
                    if (baseBalance) {
                        balances.delete(market.baseAsset);
                    }
                    if (quoteBalance) {
                        balances.delete(market.quoteAsset);
                    }
                }
            }
        }

        this.state.markets.delete(market.id);
    }

    addMarketAsset(asset: string, assetSide: "base" | "quote") {
        if (assetSide === "base") {
            if (baseAsset.includes(asset)) {
                this.reject(EVENT_REJECT_CODES.ASSET_ALREADY_EXISTS, "Base asset already exists");
            }
            baseAsset.push(asset);
        } else {
            if (quoteAsset.includes(asset)) {
                this.reject(EVENT_REJECT_CODES.ASSET_ALREADY_EXISTS, "Quote asset already exists");
            }
            quoteAsset.push(asset);
        }
    }


    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }

}