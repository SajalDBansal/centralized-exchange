import { CancelOrderPayload, CreateOrderPayload, DepthType, EVENT_REJECT_CODES, GetDepthPayload, GetDepthReturnPayload, GetOrderByIdPayload, GetUserOpenOrdersPayload, InMarketOrderType, Market, MarketType, OrderPosition, OrderSide, OrderStatus, OrderType, STPMode, TimeInForce } from "@workspace/types";
import { EngineState } from "./core-engine";
import { RejectError } from "../utils/error";

export class OrderBook {

    constructor(private readonly state: EngineState) { }

    getBestAsk(): bigint | undefined {
        return 0n;
    }

    getBestBid(): bigint | undefined {
        return 0n;
    }

    initializeMarket() {

    }

    createOrder(payload: CreateOrderPayload): InMarketOrderType {
        return {
            entryPrice: 0n,
            quantity: 0n,
            userId: "dcckhhg",
            marketId: "adfkjhg",
            side: OrderSide.BUY,
            position: OrderPosition.LONG,
            remainingQty: 0n,
            type: OrderType.LIMIT,
            postOnly: false,
            averagePrice: 0n,
            stpMode: STPMode.CANCEL_TAKER,
            timeInForce: TimeInForce.GTC,
            createdAt: 425,
            marketType: MarketType.PERP,
            orderId: "sdfkkb",
            filled: 0n,
            status: OrderStatus.OPEN,
            leverage: 0,
            margin: 0n,
            reduceOnly: false,
            fills: [],
            depths: { asks: [], bids: [] }
        }

    }

    getUserOrders(payload: GetOrderByIdPayload): InMarketOrderType {
        const marketId = this.state.orderMap.get(payload.orderId);

        if (!marketId) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "No market name found");
        }

        const orderbook = this.state.orderbooks.get(marketId);

        if (!orderbook) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "No orderbook found for the market");
        }

        const orderNode = orderbook.orderMap.get(payload.orderId);

        if (!orderNode) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Ordernode not found");
        }

        const order = orderNode.order;

        return order;
    }

    getUserOpenOrders(payload: GetUserOpenOrdersPayload): InMarketOrderType[] {


        return []
    }

    cancelOrder(payload: CancelOrderPayload): InMarketOrderType {

        return {
            entryPrice: 0n,
            quantity: 0n,
            userId: "dcckhhg",
            marketId: "adfkjhg",
            side: OrderSide.BUY,
            type: OrderType.LIMIT,
            postOnly: false,
            averagePrice: 0n,
            position: OrderPosition.LONG,
            remainingQty: 0n,
            stpMode: STPMode.CANCEL_TAKER,
            timeInForce: TimeInForce.GTC,
            createdAt: 425,
            marketType: MarketType.PERP,
            orderId: "sdfkkb",
            filled: 0n,
            status: OrderStatus.OPEN,
            leverage: 0,
            margin: 0n,
            reduceOnly: false,
            fills: [],
            depths: { asks: [], bids: [] }
        }
    }

    getMarketDepth(payload: GetDepthPayload): { market: Market, depths: { asks: DepthType[], bids: DepthType[] } } {


        return {
            market: {
                id: "sd,fjb",
                baseAsset: "szdvdk,kjh",
                quoteAsset: "sdk",
                name: "sfkjhh",
                maxLeverage: 50,
                minQty: 1,
                tickSize: 1,
                lotSize: 1,
                minNotional: 1
            },
            depths: { asks: [], bids: [] }
        }
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }

}