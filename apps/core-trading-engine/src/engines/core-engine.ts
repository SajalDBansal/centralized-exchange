import { BalancesType, BaseReturnPayload, BaseReturnPayloadWithUser, CancelOrderPayload, CancelOrderReturnPayload, CreateOrderPayload, CreateOrderReturnPayload, GetDepthPayload, GetDepthReturnPayload, GetOrderByIdPayload, GetOrderByIdReturnPayload, GetUserBalancesPayload, GetUserBalancesReturnPayload, GetUserOpenOrdersPayload, GetUserOpenOrdersReturnPayload, Market, MarketId, MarketsType, MarketType, NATS_INCOMING_SUBJECT, NatsIncomingSubjectTypes, OnRampPayload, OnRampReturnPayload, OrderId, OrderSide, OrderStatus, OrderType, PayloadToBackendType, PayloadToEngineType, OrderBookType, PositionsType, OrderList, OrderNode, UserId } from "@workspace/types";
import { OMSEngine } from "./oms-engine";
import createRBTree from "functional-red-black-tree";
import { BalanceEngine } from "./balance-engine";
import { RejectError } from "../utils/error";
import { OrderBook } from "./matching-engine";
import { Position } from "./position-engine";

export class EngineState {

    balances: BalancesType = new Map();

    orderbooks: OrderBookType = new Map();

    positions: PositionsType = new Map();

    markets: MarketsType = new Map();

    orderMap: Map<OrderId, MarketId> = new Map();
}

export const baseAsset: string[] = ["BTC", "ETH", "SOL"];
export const quoteAsset: string[] = ["USD", "INR", "PERP"];

export class Engine {
    private eventSequenceId: bigint = 1n;

    private readonly state: EngineState;

    private readonly OMSChecker: OMSEngine;

    private readonly BalanceEngine: BalanceEngine;

    private readonly OrderEngine: OrderBook;

    private readonly PositionEngine: Position;

    constructor() {

        this.state = new EngineState();

        this.initializeMarkets();

        this.OMSChecker = new OMSEngine(this.state);

        this.BalanceEngine = new BalanceEngine(this.state);

        this.OrderEngine = new OrderBook(this.state);

        this.PositionEngine = new Position(this.state);
    }

    private initializeMarkets() {

        const baseAssets = ["BTC", "ETH", "SOL"];

        const quoteAssets = ["USD", "INR", "PERP"];

        for (const base of baseAssets) {

            for (const quote of quoteAssets) {

                const marketId = `${base}_${quote}`;

                this.state.markets.set(marketId, {
                    id: marketId,
                    name: marketId,
                    baseAsset: base,
                    quoteAsset: quote,
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
                    userOrders: new Map<UserId, Set<OrderId>>,
                    lastTradePrice: 0n,
                    indexPrice: 0n,
                });
            }
        }
    }

    async process(subject: NatsIncomingSubjectTypes, data: PayloadToEngineType): Promise<PayloadToBackendType> {

        try {
            switch (subject) {

                case NATS_INCOMING_SUBJECT.HEALTH_CHECK:

                    return {
                        success: true,
                        eventId: this.getUpdatedEventId(),
                        timestamp: Date.now(),
                        message: "Engine healthy",
                    };

                case NATS_INCOMING_SUBJECT.ORDER_CREATE:
                    return this.createOrder(data as CreateOrderPayload);

                case NATS_INCOMING_SUBJECT.ORDER_CANCEL:
                    return this.cancelOrder(data as CancelOrderPayload);

                case NATS_INCOMING_SUBJECT.ORDER_OPEN_ORDERS:
                    return this.getOpenOrders(data as GetUserOpenOrdersPayload);

                case NATS_INCOMING_SUBJECT.ORDER_GET:
                    return this.getOrder(data as GetOrderByIdPayload);

                case NATS_INCOMING_SUBJECT.BALANCE_GET:
                    return this.getBalance(data as GetUserBalancesPayload);

                case NATS_INCOMING_SUBJECT.ON_RAMP:
                    return this.onRamp(data as OnRampPayload);

                case NATS_INCOMING_SUBJECT.DEPTH_GET:
                    return this.getMarketDepth(data as GetDepthPayload);

                default:
                    return this.internalError("Invalid subject");
            }

        } catch (error) {

            console.error(error);

            return this.internalError(
                "Internal engine error"
            );
        }
    }


    private createOrder(payload: CreateOrderPayload): CreateOrderReturnPayload {

        try {

            this.OMSChecker.createOrderChecks(payload);

            this.BalanceEngine.lockBalance(payload);

            const result = this.OrderEngine.createOrder(payload);


            for (const fill of result.fills) {

                if (payload.marketType === MarketType.PERP) {
                    this.PositionEngine.applyFill(fill);
                } else {
                    this.BalanceEngine.applyFill(fill);
                }
            }

            this.BalanceEngine.releaseUnusedBalance(result);

            return {
                success: true,
                message: "Order created successfully",
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                data: {
                    order: result,
                    orderId: result.orderId,
                    status: result.status,
                    averagePrice: (result.averagePrice).toString(),
                    executedQty: (result.filled).toString(),
                    remainingQty: (result.remainingQty).toString(),
                    fills: result.fills,
                    depths: result.depths,
                },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Create order failed") as CreateOrderReturnPayload;
        }
    }

    private cancelOrder(payload: CancelOrderPayload): CancelOrderReturnPayload {

        try {

            this.OMSChecker.cancelOrderChecks(payload);

            const order = this.OrderEngine.cancelOrder(payload);

            /* =============================================
               RELEASE LOCKED BALANCE
            ============================================= */

            this.BalanceEngine.releaseOrderMargin(order);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Order canceled successfully",
                data: { order },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Cancel order failed") as CancelOrderReturnPayload;
        }
    }

    private getBalance(payload: GetUserBalancesPayload): GetUserBalancesReturnPayload {

        try {

            const balances = this.BalanceEngine.getUserBalances(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Balances fetched",
                data: { balances },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Get balance failed") as GetUserBalancesReturnPayload;
        }
    }

    private onRamp(payload: OnRampPayload): OnRampReturnPayload {

        try {

            this.OMSChecker.UserBalanceCheck(payload);

            const balances = this.BalanceEngine.addBalance(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Balance added successfully",
                data: { ...balances },
            };

        } catch (error) {

            if (error instanceof RejectError) {
                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Onramp failed") as OnRampReturnPayload;
        }
    }

    private getOrder(payload: GetOrderByIdPayload): GetOrderByIdReturnPayload {

        try {
            this.OMSChecker.getOrderByIdCheck(payload);

            const order = this.OrderEngine.getUserOrders(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Order fetched",
                data: { order },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Get order failed") as GetOrderByIdReturnPayload;
        }
    }

    private getOpenOrders(payload: GetUserOpenOrdersPayload): GetUserOpenOrdersReturnPayload {

        try {
            this.OMSChecker.getOpenOrderChecks(payload);

            const orders = this.OrderEngine.getUserOpenOrders(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Open orders fetched",
                data: { orders },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Get open orders failed") as GetUserOpenOrdersReturnPayload;
        }
    }

    private getMarketDepth(payload: GetDepthPayload): GetDepthReturnPayload {

        try {
            this.OMSChecker.getDepthMarketCheck(payload);

            const data = this.OrderEngine.getMarketDepth(payload);

            return {
                success: true,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Depth fetched",
                data: { ...data },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Depth fetch failed") as GetDepthReturnPayload;
        }
    }

    private internalError(message: string): BaseReturnPayload {

        return {
            success: false,
            eventId: this.getUpdatedEventId(),
            timestamp: Date.now(),
            message,
        };
    }

    private getUpdatedEventId(): string {

        return (++this.eventSequenceId).toString();
    }
}

