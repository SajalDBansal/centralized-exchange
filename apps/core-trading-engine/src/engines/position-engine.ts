import {
    BalancesType,
    EVENT_REJECT_CODES,
    InMarketFillType,
    InMarketOrderType,
    Market,
    MarketId,
    MarketsType,
    MarketType,
    FundingPayments,
    MarketFunds,
    UserPositionType,
} from "@workspace/types";
import { RejectError } from "../utils/error";
import { SingleMarketPositions } from "./single-market-positions";

type PositionEngineDeps = {
    readonly markets: MarketsType;
    readonly balances: BalancesType;
    readonly insuranceFunds: MarketFunds;
    readonly fundingPayments: FundingPayments;
    positions: Map<MarketId, SingleMarketPositions>;
};

export class Position {
    constructor(private readonly state: PositionEngineDeps) { }

    initializeMarket(market: Market) {
        if (!this.state.positions.has(market.id)) {
            this.state.positions.set(
                market.id,
                new SingleMarketPositions(market, this.state.balances, this.state.insuranceFunds, this.state.fundingPayments)
            );
        }
    }

    deleteMarket(marketId: MarketId) {
        this.state.positions.delete(marketId);
    }

    restorePosition(position: UserPositionType) {
        const market = this.getMarket(position.market);
        this.initializeMarket(market);
        this.getMarketPositions(position.market).restore(position);
    }

    applyFill(fill: InMarketFillType, makerOrder: InMarketOrderType, takerOrder: InMarketOrderType) {
        if (makerOrder.marketType !== MarketType.PERP || takerOrder.marketType !== MarketType.PERP) {
            return;
        }

        const positions = this.getMarketPositions(fill.marketId);
        positions.applyOrderFill(makerOrder, fill.makerUserId, fill.qty, fill.price);
        positions.applyOrderFill(takerOrder, fill.takerUserId, fill.qty, fill.price);
    }

    getLiquidatablePositions(marketId: MarketId, indexPrice: bigint) {
        return this.getMarketPositions(marketId).getLiquidatablePositions(indexPrice);
    }

    applyFunding(marketId: MarketId, fundingRateBps: bigint, timestamp: number) {
        return this.getMarketPositions(marketId).applyFunding(fundingRateBps, timestamp);
    }

    private getMarketPositions(marketId: MarketId) {
        const positions = this.state.positions.get(marketId);

        if (!positions) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Market positions not found");
        }

        return positions;
    }

    private getMarket(marketId: MarketId) {
        const market = this.state.markets.get(marketId);

        if (!market) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Market not found");
        }

        return market;
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
