import {
    BaseBalanceType,
    CancelOrderPayload,
    DepthType,
    EVENT_REJECT_CODES,
    GetDepthPayload,
    GetOrderByIdPayload,
    GetUserOpenOrdersPayload,
    InMarketOrderType,
    Market,
    MarketId,
    normalizeIncomingOrderType,
    OrderId,
    OrderStatus,
    UserPosition,
} from "@workspace/types";
import cuid from "cuid";
import { RejectError } from "../utils/error";
import { SingleMarketOrderBook } from "./single-orderbook";

type ReadonlyEngineState = {
    readonly markets: ReadonlyMap<MarketId, Market>;
    readonly balances: ReadonlyMap<string, BaseBalanceType>;
    readonly positions: ReadonlyMap<MarketId, UserPosition>;
};

type MatchingEngineDeps = ReadonlyEngineState & {
    orderbooks: Map<MarketId, SingleMarketOrderBook>;
    orderMap: Map<OrderId, MarketId>;
    orders: Map<OrderId, InMarketOrderType>;
};

export class MatchingEngine {
    constructor(private readonly state: MatchingEngineDeps) { }

    initializeMarket(market: Market) {
        if (this.state.orderbooks.has(market.id)) {
            this.reject(EVENT_REJECT_CODES.MARKET_ALREADY_EXISTS, "Orderbook already exists");
        }

        this.state.orderbooks.set(market.id, new SingleMarketOrderBook(market, this.state.orderMap));
    }

    createOrder(payload: normalizeIncomingOrderType): InMarketOrderType {
        const orderbook = this.state.orderbooks.get(payload.marketId);

        if (!orderbook) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Orderbook not found");
        }

        const order: InMarketOrderType = {
            ...payload,
            orderId: cuid(),
            filled: 0n,
            remainingQty: payload.quantity,
            averagePrice: 0n,
            status: OrderStatus.OPEN,
            fills: [],
            depths: { asks: [], bids: [] },
        } as InMarketOrderType;

        const result = orderbook.addOrder(order);
        this.state.orders.set(result.orderId, result);

        return result;
    }

    cancelOrder(payload: CancelOrderPayload): InMarketOrderType {
        const marketId = this.state.orderMap.get(payload.orderId);

        if (!marketId) {
            this.reject(EVENT_REJECT_CODES.ORDER_NOT_FOUND, "Order not found");
        }

        const orderbook = this.state.orderbooks.get(marketId);

        if (!orderbook) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Orderbook not found");
        }

        return orderbook.cancelOrder(payload);
    }

    getUserOrderByID(payload: GetOrderByIdPayload): InMarketOrderType {
        const order = this.state.orders.get(payload.orderId);

        if (order) {
            if (order.userId !== payload.userId) {
                this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Unauthorized");
            }

            return order;
        }

        const marketId = this.state.orderMap.get(payload.orderId);

        if (!marketId) {
            this.reject(EVENT_REJECT_CODES.ORDER_NOT_FOUND, "Order not found");
        }

        const orderbook = this.state.orderbooks.get(marketId);

        if (!orderbook) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Orderbook not found");
        }

        return orderbook.getUserOrderByID(payload);
    }

    getUserOpenOrders(payload: GetUserOpenOrdersPayload): InMarketOrderType[] {
        const orderbook = this.state.orderbooks.get(payload.marketId);

        if (!orderbook) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Orderbook not found");
        }

        return orderbook.getUserOpenOrders(payload.userId);
    }

    getMarketDepth(payload: GetDepthPayload): { depths: { asks: DepthType[]; bids: DepthType[]; } } {
        const orderbook = this.state.orderbooks.get(payload.marketId);

        if (!orderbook) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Orderbook not found");
        }

        return { depths: orderbook.getDepth() };
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
