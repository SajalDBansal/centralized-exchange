import { BalancesType, BaseReturnPayload, BaseReturnPayloadWithUser, CancelOrderPayload, CancelOrderReturnPayload, CreateOrderPayload, CreateOrderReturnPayload, GetDepthPayload, GetDepthReturnPayload, GetOrderByIdPayload, GetOrderByIdReturnPayload, GetUserBalancesPayload, GetUserBalancesReturnPayload, GetUserOpenOrdersPayload, GetUserOpenOrdersReturnPayload, Market, MarketId, MarketsType, MarketType, NATS_INCOMING_SUBJECT, NatsIncomingSubjectTypes, OnRampPayload, OrderId, OrderSide, OrderStatus, OrderType, PayloadToBackendType, PayloadToEngineType, PerpOrderBookType, PositionsType, STPMode, TimeInForce } from "@workspace/types";
import { OMSEngine } from "./oms-engine";
import createRBTree from "functional-red-black-tree";
import { BalanceEngine } from "./balance-engine";
import { RejectError } from "../utils/error";
import { OrderBook } from "./matching-engine";

export let BALANCES: BalancesType = new Map();
export let ORDERBOOKS: PerpOrderBookType = new Map();
export let POSITIONS: PositionsType = new Map();
export let MARKETS: MarketsType = new Map();
export let ORDERMAP: Map<OrderId, MarketId> = new Map();

export const baseAsset: string[] = ["BTC", "ETH", "SOL"];
export const quoteAsset: string[] = ["USD", "INR", "PERP"];

// Todo - set this to get from database
for (const base of baseAsset) {

    BALANCES.set(base, new Map());

    for (const quote of quoteAsset) {
        const marketId = `${base}_${quote}`
        MARKETS.set(marketId, {
            id: marketId,
            name: marketId,
            baseAsset: base,
            quoteAsset: quote,
            maxLeverage: 50,
            minQty: 1n,
            tickSize: 1n,
            lotSize: 1n,
            minNotional: 1n // minQty * lastTradedprice
        })

        POSITIONS.set(marketId, new Map());

        ORDERBOOKS.set(marketId, {
            market: marketId,
            tickSize: 1n,
            lotSize: 1n,
            bids: new Map(),
            asks: new Map(),
            bidTree: createRBTree<bigint, boolean>(),
            askTree: createRBTree<bigint, boolean>(),
            orderMap: new Map(),
            userOrders: new Map(),
            lastTradePrice: 0n,
            indexPrice: 0n
        })

        BALANCES.set(quote, new Map());
    }
}

export class Engine {
    eventSequenceId: bigint = 1n;
    private OMSChecker: OMSEngine = new OMSEngine();
    private BalanceEngine: BalanceEngine = new BalanceEngine();
    private OrderEngine: OrderBook = new OrderBook();

    constructor() { }


    async process(subject: NatsIncomingSubjectTypes, data: PayloadToEngineType): Promise<PayloadToBackendType> {
        try {
            switch (subject) {
                case NATS_INCOMING_SUBJECT.HEALTH_CHECK:
                    const toSend: BaseReturnPayload = {
                        success: true,
                        eventId: this.eventSequenceId,
                        message: "Hello from engine",
                    }
                    return toSend;

                case NATS_INCOMING_SUBJECT.ORDER_CREATE:
                    const createPayloadData = data as CreateOrderPayload;
                    return this.createOrder(createPayloadData);

                case NATS_INCOMING_SUBJECT.ORDER_CANCEL:
                    const cancelPayloadData = data as CancelOrderPayload;
                    return this.cancelOrder(cancelPayloadData);

                case NATS_INCOMING_SUBJECT.ORDER_OPEN_ORDERS:
                    const openOrderPayloadData = data as GetUserOpenOrdersPayload;
                    return this.getOpenOrders(openOrderPayloadData);

                case NATS_INCOMING_SUBJECT.ORDER_GET:
                    const getOrderPayloadData = data as GetOrderByIdPayload;
                    return this.getOrder(getOrderPayloadData);

                case NATS_INCOMING_SUBJECT.BALANCE_GET:
                    const getBalancePayloadData = data as GetUserBalancesPayload;
                    return this.getBalance(getBalancePayloadData);

                case NATS_INCOMING_SUBJECT.ON_RAMP:
                    const onRampPayloadData = data as OnRampPayload;
                    return this.onRamp(onRampPayloadData);

                case NATS_INCOMING_SUBJECT.DEPTH_GET:
                    const getDepthPayloadData = data as GetDepthPayload;
                    return this.getMarketDepth(getDepthPayloadData);

                default:
                    const errorData: BaseReturnPayload = {
                        success: false,
                        eventId: this.eventSequenceId,
                        message: "No such subject available on engine",
                    }
                    return errorData;
            }

        } catch (error: any) {
            const errorData: BaseReturnPayload = {
                success: false,
                eventId: this.eventSequenceId,
                message: error || "No such subject available on engine",
            }
            return errorData;
        }

    }

    private createOrder(payload: CreateOrderPayload): CreateOrderReturnPayload {

        try {
            this.OMSChecker.createOrderChecks(payload);
            this.BalanceEngine.lockBalance(payload);

            // createdorder = orderbook create order

            // for spot
            this.BalanceEngine.updateTakerBalance(payload);
            this.BalanceEngine.updateMakerBalance(payload);

            // for position
            // send order too positions

            return {
                success: true,
                message: "Order created successfully",
                userId: payload.userId,
                eventId: 0n,
                orderId: "",
                order: {
                    entryPrice: 0n,
                    quantity: 0n,
                    userId: "dcckhhg",
                    marketId: "adfkjhg",
                    side: OrderSide.LONG,
                    type: OrderType.LIMIT,
                    postOnly: false,
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
                },
                status: OrderStatus.OPEN,
                averagePrice: 0n,
                executedQty: 0n,
                remainingQty: 0n,
                fills: [],
                depths: { asks: [], bids: [] },
            }


        } catch (error) {
            if (error instanceof RejectError) {
                throw new Error(`${error.code}: ${error.message}`);
            }
            console.error(error);
            throw new Error(`Internal OMS engine error`);
        }
    }

    private getBalance(payload: GetUserBalancesPayload): GetUserBalancesReturnPayload {
        try {
            const balances = this.BalanceEngine.getUserBalances(payload);

            return {
                success: true,
                message: "Fetched user balances succssfully",
                userId: payload.userId,
                eventId: ++this.eventSequenceId,
                balances
            }

        } catch (error) {
            if (error instanceof RejectError) {
                throw new Error(`${error.code}: ${error.message}`);
            }
            console.error(error);
            throw new Error(`Error Getting Balance`);
        }
    }

    private onRamp(payload: OnRampPayload): BaseReturnPayloadWithUser {
        try {
            this.OMSChecker.UserBalanceCheck(payload);
            const balances = this.BalanceEngine.addBalance(payload);

            return {
                success: true,
                message: "Fetched user balances succssfully",
                userId: payload.userId,
                eventId: ++this.eventSequenceId,
                ...balances,
            }

        } catch (error) {
            if (error instanceof RejectError) {
                throw new Error(`${error.code}: ${error.message}`);
            }
            console.error(error);
            throw new Error(`Error in Adding balance`);
        }
    }

    private cancelOrder(payload: CancelOrderPayload): CancelOrderReturnPayload {
        try {
            this.OMSChecker.cancelOrderChecks(payload);
            const order = this.OrderEngine.cancelOrder(payload);

            return {
                success: true,
                message: "Fetched user balances succssfully",
                userId: payload.userId,
                eventId: ++this.eventSequenceId,
                order
            }

        } catch (error) {
            if (error instanceof RejectError) {
                throw new Error(`${error.code}: ${error.message}`);
            }
            console.error(error);
            throw new Error(`Error fetching balance`);
        }
    }

    private getOrder(payload: GetOrderByIdPayload): GetOrderByIdReturnPayload {
        try {
            this.OMSChecker.getOrderByIdCheck(payload);
            const order = this.OrderEngine.getUserOrders(payload);

            return {
                success: true,
                message: "Fetched user balances succssfully",
                userId: payload.userId,
                eventId: ++this.eventSequenceId,
                order
            }

        } catch (error) {
            if (error instanceof RejectError) {
                throw new Error(`${error.code}: ${error.message}`);
            }
            console.error(error);
            throw new Error(`Error fetching balance`);
        }
    }

    private getOpenOrders(payload: GetUserOpenOrdersPayload): GetUserOpenOrdersReturnPayload {
        try {
            this.OMSChecker.getOpenOrderChecks(payload);
            const orders = this.OrderEngine.getUserOpenOrders(payload);

            return {
                success: true,
                message: "Fetched user balances succssfully",
                userId: payload.userId,
                eventId: ++this.eventSequenceId,
                orders
            }

        } catch (error) {
            if (error instanceof RejectError) {
                throw new Error(`${error.code}: ${error.message}`);
            }
            console.error(error);
            throw new Error(`Error fetching Users Open Orders`);
        }
    }

    private getMarketDepth(payload: GetDepthPayload): GetDepthReturnPayload {
        try {
            this.OMSChecker.getDepthMarketCheck(payload);
            const data = this.OrderEngine.getMarketDepth(payload);

            return {
                success: true,
                message: "Fetched user balances succssfully",
                eventId: ++this.eventSequenceId,
                depths: data.depths,
                market: data.market
            }

        } catch (error) {
            if (error instanceof RejectError) {
                throw new Error(`${error.code}: ${error.message}`);
            }
            console.error(error);
            throw new Error(`Error fetching Users Open Orders`);
        }
    }


}