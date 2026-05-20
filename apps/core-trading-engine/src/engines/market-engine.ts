import { Market, MarketsType } from "@workspace/types";
import { EngineState } from "./core-engine";

type MarketEngineDeps = {
    markets: MarketsType;
};

export const baseAsset: string[] = ["BTC", "ETH", "SOL"];
export const quoteAsset: string[] = ["USD", "INR", "PERP"];


export class MarketEngine {

    constructor(private state: MarketEngineDeps) { }

    getMarkets(): MarketsType {
        return this.state.markets;
    }

    getMarketById(marketId: string) {
        const market = this.state.markets.get(marketId);
        if (!market) {
            throw new Error("Market not found");
        }
        return market;
    }

    updateMarket(marketId: string, marketData: Partial<Market>): Market {
        const market = this.getMarketById(marketId);
        const updatedMarket = { ...market, ...marketData };
        this.state.markets.set(marketId, updatedMarket);
        return updatedMarket;
    }

    addMarket(marketData: Market) {
        if (this.state.markets.has(marketData.id)) {
            throw new Error("Market already exists");
        }
        this.state.markets.set(marketData.id, marketData);
    }

    // TODO: add check to see if there are any open positions/orders in the market before deleting
    deleteMarket(marketId: string) {
        if (!this.state.markets.has(marketId)) {
            throw new Error("Market not found");
        }
        this.state.markets.delete(marketId);
    }

}