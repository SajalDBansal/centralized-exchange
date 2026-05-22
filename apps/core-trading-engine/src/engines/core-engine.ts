import { BalancesType, BaseReturnPayload, CancelOrderPayload, CancelOrderReturnPayload, CreateOrderPayload, CreateOrderReturnPayload, GetDepthPayload, GetDepthReturnPayload, GetOrderByIdPayload, GetOrderByIdReturnPayload, GetUserBalancesPayload, GetUserBalancesReturnPayload, GetUserOpenOrdersPayload, GetUserOpenOrdersReturnPayload, MarketId, MarketsType, MarketType, NATS_INCOMING_SUBJECT, NatsIncomingSubjectTypes, OnRampPayload, OnRampReturnPayload, OrderId, PayloadToBackendType, PayloadToEngineType, OrderBookType, PositionsType, OrderList, OrderNode, UserId, GetMarketByIdPayload, GetMarketByIdReturnPayload, AddMarketPayload, GetMarketsPayload, GetMarketsReturnPayload, UpdateMarketPayload, UpdateMarketReturnPayload, DeleteMarketPayload, DeleteMarketReturnPayload, AddUserPayload, BaseReturnPayloadWithUser, AddMarketAssetPayload } from "@workspace/types";
import { OMSEngine } from "./oms-engine";
import createRBTree from "functional-red-black-tree";
import { BalanceEngine } from "./balance-engine";
import { RejectError } from "../utils/error";
import { OrderBook } from "./matching-engine";
import { Position } from "./position-engine";
import { normalizeOrderReturn } from "../utils/parse-incoming";
import { MarketEngine } from "./market-engine";

export class EngineState {

    balances: BalancesType = new Map();

    orderbooks: OrderBookType = new Map();

    positions: PositionsType = new Map();

    markets: MarketsType = new Map();

    orderMap: Map<OrderId, MarketId> = new Map();
}


export class Engine {
    eventSequenceId: number;

    private readonly state: EngineState;

    private readonly omsChecker: OMSEngine;

    private readonly balanceEngine: BalanceEngine;

    private readonly orderEngine: OrderBook;

    private readonly positionEngine: Position;

    private readonly marketEngine: MarketEngine;

    constructor() {

        this.eventSequenceId = 0;

        this.state = new EngineState();


        this.omsChecker = new OMSEngine(this.state);

        this.balanceEngine = new BalanceEngine(this.state);

        this.orderEngine = new OrderBook(this.state);

        this.positionEngine = new Position(this.state);

        this.marketEngine = new MarketEngine(this.state);

        this.marketEngine.initializeMarkets();
    }

    process = async (subject: NatsIncomingSubjectTypes, data: PayloadToEngineType): Promise<PayloadToBackendType> => {

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

                case NATS_INCOMING_SUBJECT.USER_ADD:
                    return this.userAdd(data as AddUserPayload);

                case NATS_INCOMING_SUBJECT.MARKET_GET_ALL:
                    return this.getAllMarkets(data as GetMarketsPayload);

                case NATS_INCOMING_SUBJECT.MARKET_GET:
                    return this.getMarketById(data as GetMarketByIdPayload);

                case NATS_INCOMING_SUBJECT.MARKET_ADD:
                    return this.addMarket(data as AddMarketPayload);

                case NATS_INCOMING_SUBJECT.MARKET_UPDATE:
                    return this.updateMarket(data as UpdateMarketPayload);

                case NATS_INCOMING_SUBJECT.MARKET_DELETE:
                    return this.deleteMarket(data as DeleteMarketPayload);

                case NATS_INCOMING_SUBJECT.MARKET_ADD_ASSET:
                    return this.addMarketAsset(data as AddMarketAssetPayload);

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

    private createOrder = (payload: CreateOrderPayload): CreateOrderReturnPayload => {

        try {

            const parsedOrder = this.omsChecker.createOrderChecks(payload);

            this.balanceEngine.lockBalance(parsedOrder);

            const result = this.orderEngine.createOrder(parsedOrder);


            for (const fill of result.fills) {

                if (payload.marketType === MarketType.PERP) {
                    this.positionEngine.applyFill(fill);
                } else {
                    this.balanceEngine.applyFill(fill);
                }
            }

            this.balanceEngine.releaseUnusedBalance(result);

            return {
                success: true,
                message: "Order created successfully",
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                data: {
                    order: normalizeOrderReturn(result),
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

    private cancelOrder = (payload: CancelOrderPayload): CancelOrderReturnPayload => {

        try {

            this.omsChecker.cancelOrderChecks(payload);

            const order = this.orderEngine.cancelOrder(payload);

            /* =============================================
               RELEASE LOCKED BALANCE
            ============================================= */

            this.balanceEngine.releaseOrderMargin(order);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Order canceled successfully",
                data: { order: normalizeOrderReturn(order) },
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

    private getBalance = (payload: GetUserBalancesPayload): GetUserBalancesReturnPayload => {

        try {

            const balances = this.balanceEngine.getUserBalances(payload);

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

    private onRamp = (payload: OnRampPayload): OnRampReturnPayload => {

        try {

            const parsed = this.omsChecker.UserBalanceCheck(payload);

            const balances = this.balanceEngine.addBalance(parsed);

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

    private getOrder = (payload: GetOrderByIdPayload): GetOrderByIdReturnPayload => {

        try {
            this.omsChecker.getOrderByIdCheck(payload);

            const order = this.orderEngine.getUserOrders(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Order fetched",
                data: { order: normalizeOrderReturn(order) },
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

    private getOpenOrders = (payload: GetUserOpenOrdersPayload): GetUserOpenOrdersReturnPayload => {

        try {
            this.omsChecker.getOpenOrderChecks(payload);

            const orders = this.orderEngine.getUserOpenOrders(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Open orders fetched",
                data: { orders: orders.map(normalizeOrderReturn) },
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

    private getMarketDepth = (payload: GetDepthPayload): GetDepthReturnPayload => {

        try {
            this.omsChecker.getDepthMarketCheck(payload);

            const data = this.orderEngine.getMarketDepth(payload);

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

    getUpdatedEventId(): number {

        return (++this.eventSequenceId);
    }

    private getMarketById = (payload: GetMarketByIdPayload): GetMarketByIdReturnPayload => {
        try {
            const market = this.omsChecker.getMarketByIdCheck(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market fetched",
                data: { market },
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
            return this.internalError("Get market failed") as GetMarketByIdReturnPayload;
        }
    };

    private addMarket = (payload: AddMarketPayload): BaseReturnPayloadWithUser => {
        try {
            this.omsChecker.addMarketCheck(payload);
            this.marketEngine.addMarket(payload.market);

            this.state.positions.set(
                payload.market.id,
                new Map()
            );

            this.state.orderbooks.set(payload.market.id, {
                market: payload.market.id,
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


            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market added successfully",
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
            return this.internalError("Add market failed") as BaseReturnPayloadWithUser;
        }
    };

    private getAllMarkets = (payload: GetMarketsPayload): GetMarketsReturnPayload => {
        try {
            const markets = this.marketEngine.getMarkets();
            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Markets fetched",
                data: { markets },
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
            return this.internalError("Get markets failed") as GetMarketsReturnPayload;
        }
    };

    private updateMarket = (payload: UpdateMarketPayload): UpdateMarketReturnPayload => {
        try {
            this.omsChecker.updateMarketCheck(payload);
            const market = this.marketEngine.updateMarket(payload.marketId, payload.market);
            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market updated successfully",
                data: { market },
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
            return this.internalError("Update market failed") as UpdateMarketReturnPayload;
        }
    };

    private deleteMarket = (payload: DeleteMarketPayload): DeleteMarketReturnPayload => {
        try {
            this.omsChecker.deleteMarketCheck(payload);
            this.marketEngine.deleteMarket(payload.marketId);
            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market deleted successfully",
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
            return this.internalError("Delete market failed") as DeleteMarketReturnPayload;
        }
    };

    private userAdd = (payload: AddUserPayload): BaseReturnPayload => {

        try {
            this.omsChecker.addUserCheck(payload.userId);

            const result = this.balanceEngine.addUser(payload.userId);

            return {
                success: result.success,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: result.message,
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
            return this.internalError("Failed to add user") as BaseReturnPayload;
        }
    };

    private addMarketAsset = (payload: AddMarketAssetPayload): BaseReturnPayloadWithUser => {

        try {
            this.omsChecker.addMarketAssetCheck(payload);
            this.marketEngine.addMarketAsset(payload.asset, payload.assetSide);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market asset added successfully",
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
            return this.internalError("Add market asset failed") as BaseReturnPayloadWithUser;
        }
    };
}

