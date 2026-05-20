import {
    AddMarketPayload,
    CancelOrderPayload,
    CreateOrderPayload,
    DeleteMarketPayload,
    EVENT_REJECT_CODES,
    GetDepthPayload,
    GetMarketByIdPayload,
    GetOrderByIdPayload,
    GetUserOpenOrdersPayload,
    Market,
    MarketType,
    normalizeIncomingOrderType,
    NormalizeOnRampType,
    OnRampPayload,
    OrderId,
    OrderList,
    OrderPosition,
    OrderSide,
    OrderType,
    STPMode,
    TimeInForce,
    UpdateMarketPayload,
} from "@workspace/types";

import { EngineState, } from "./core-engine";

import { RejectError } from "../utils/error";
import { normalizeOrderIncoming, normalizeOnRampPayload } from "../utils/parse-incoming";
import { baseAsset, quoteAsset } from "./market-engine";

export class OMSEngine {

    constructor(private readonly state: EngineState) { }

    // PUBLIC CHECKS

    createOrderChecks(order: CreateOrderPayload) {
        const parsed = normalizeOrderIncoming(order);

        const market = this.validateMarket(parsed.marketId);

        this.validateBasicOrder(parsed);

        this.validateTIF(parsed);

        this.validateMarketConstraints(parsed, market);

        this.validatePositionRules(parsed);

        this.validateOrderbookRules(parsed);

        this.validateRiskRules(parsed, market);

        return parsed;
    }

    UserBalanceCheck(payload: OnRampPayload): NormalizeOnRampType {

        const parsed = normalizeOnRampPayload(payload);

        const inBase = baseAsset.includes(payload.asset);

        const inQuote = quoteAsset.includes(payload.asset);

        if (!inBase && !inQuote) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Invalid asset");
        }

        return parsed;
    }

    getOrderByIdCheck(payload: GetOrderByIdPayload) {
        this.validateOrderId(payload.orderId);
    }

    getOpenOrderChecks(payload: GetUserOpenOrdersPayload) {
        this.validateMarket(payload.marketId);
    }

    getDepthMarketCheck(payload: GetDepthPayload) {
        this.validateMarket(payload.marketId);
    }

    cancelOrderChecks(order: CancelOrderPayload) {
        this.validateOrderId(order.orderId);
    }

    addUserCheck(userId: string) {
        if (this.state.balances.has(userId)) {
            this.reject(EVENT_REJECT_CODES.USER_ALREADY_EXISTS, "User already exists")
        }
    }

    deleteMarketCheck(payload: DeleteMarketPayload) {
        this.validateMarket(payload.marketId);
    }

    addMarketCheck(payload: AddMarketPayload) {
        if (this.state.markets.has(payload.market.id)) {
            this.reject(EVENT_REJECT_CODES.MARKET_ALREADY_EXISTS, "Market already exists");
        }
    }

    getMarketByIdCheck(payload: GetMarketByIdPayload) {
        this.validateMarket(payload.marketId);
    }

    updateMarketCheck(payload: UpdateMarketPayload) {
        const market = this.validateMarket(payload.marketId);

        if (payload.market.baseAsset && payload.market.baseAsset !== market.baseAsset) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Base asset cannot be changed");
        }
        if (payload.market.quoteAsset && payload.market.quoteAsset !== market.quoteAsset) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Quote asset cannot be changed");
        }

        if (payload.market.tickSize && payload.market.tickSize <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_TICK_SIZE, "Tick size cannot be changed");
        }

        if (payload.market.lotSize && payload.market.lotSize <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_LOT_SIZE, "Lot size cannot be changed");
        }

        if (payload.market.maxLeverage && payload.market.maxLeverage <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_LEVERAGE, "Max leverage cannot be changed");
        }

        if (payload.market.precision && payload.market.precision <= 0) {
            this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Precision cannot be changed");
        }

        if (payload.market.minQty && payload.market.minQty <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_QUANTITY, "Min quantity cannot be changed");
        }

        if (payload.market.minNotional && payload.market.minNotional <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_AMOUNT, "Min notional cannot be changed");
        }
    }

    // MARKET VALIDATION

    private validateMarket(marketId: string): Market {

        const market = this.state.markets.get(marketId);

        if (!market) {
            return this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Invalid market");
        }

        return market;
    }

    //    BASIC ORDER VALIDATION

    private validateBasicOrder(order: normalizeIncomingOrderType) {

        if (order.side !== OrderSide.BUY && order.side !== OrderSide.SELL) {

            return this.reject(EVENT_REJECT_CODES.INVALID_SIDE, "Invalid order side");
        }

        if (order.type !== OrderType.LIMIT && order.type !== OrderType.MARKET) {

            return this.reject(EVENT_REJECT_CODES.INVALID_ORDER_TYPE, "Invalid order type");
        }

        if (order.quantity <= 0n) {

            return this.reject(EVENT_REJECT_CODES.INVALID_QUANTITY, "Quantity must be positive");
        }

        //    MARKET ORDERS

        if (order.type === OrderType.MARKET && typeof order.entryPrice !== "undefined") {

            return this.reject(EVENT_REJECT_CODES.INVALID_PRICE, "Market orders cannot have price");
        }

        //    LIMIT ORDERS

        if (order.type === OrderType.LIMIT && typeof order.entryPrice === "undefined") {

            return this.reject(EVENT_REJECT_CODES.INVALID_PRICE, "Limit order requires price");
        }

        if (typeof order.entryPrice !== "undefined" && order.entryPrice <= 0n) {

            return this.reject(EVENT_REJECT_CODES.INVALID_PRICE, "Price must be positive");
        }

        //    PERP VALIDATION

        if (order.marketType === MarketType.PERP) {

            if (order.position !== OrderPosition.LONG && order.position !== OrderPosition.SHORT) {

                return this.reject(EVENT_REJECT_CODES.INVALID_POSITION, "Invalid position direction");
            }

            if (order.leverage <= 0) {

                return this.reject(EVENT_REJECT_CODES.INVALID_LEVERAGE, "Invalid leverage");
            }
        }

        //    SPOT VALIDATION

        if (order.marketType !== MarketType.PERP && typeof order.position !== "undefined") {

            return this.reject(EVENT_REJECT_CODES.INVALID_POSITION, "Spot order cannot have position");
        }
    }

    //    TIME IN FORCE VALIDATION

    private validateTIF(order: normalizeIncomingOrderType) {

        if (order.type === OrderType.MARKET && order.timeInForce === TimeInForce.GTC) {

            return this.reject(EVENT_REJECT_CODES.MARKET_ORDER_GTC, "Market orders cannot use GTC");
        }
    }

    //    MARKET CONSTRAINTS

    private validateMarketConstraints(order: normalizeIncomingOrderType, market: Market) {

        if (order.marketType === MarketType.PERP) {

            if (order.leverage > market.maxLeverage) {

                return this.reject(EVENT_REJECT_CODES.LEVERAGE_EXCEEDED, "Leverage exceeds limit");
            }
        }

        if (order.quantity < market.minQty) {

            return this.reject(EVENT_REJECT_CODES.BELOW_MIN_QTY, "Quantity below minimum");
        }

        if (order.quantity % BigInt(market.lotSize) !== 0n) {

            return this.reject(EVENT_REJECT_CODES.INVALID_LOT_SIZE, "Invalid lot size");
        }

        if (typeof order.entryPrice !== "undefined" && order.entryPrice % BigInt(market.tickSize) !== 0n) {

            return this.reject(EVENT_REJECT_CODES.INVALID_TICK_SIZE, "Invalid tick size");
        }

        if (typeof order.entryPrice !== "undefined") {

            const notional = order.entryPrice * order.quantity;

            if (notional < market.minNotional) {

                return this.reject(EVENT_REJECT_CODES.BELOW_MIN_NOTIONAL, "Below minimum notional");
            }
        }
    }

    //    POSITION RULES

    private validatePositionRules(order: normalizeIncomingOrderType) {

        if (order.marketType !== MarketType.PERP) {
            return;
        }

        const marketPositions = this.state.positions.get(order.marketId);

        if (!marketPositions) {
            return;
        }

        const position = marketPositions.get(order.userId);

        if (!position) {

            if (order.reduceOnly) {

                return this.reject(EVENT_REJECT_CODES.REDUCE_ONLY_INVALID, "No position exists to reduce");
            }

            return;
        }


        //    REDUCE ONLY


        if (order.reduceOnly && position.position === order.position) {

            return this.reject(EVENT_REJECT_CODES.REDUCE_ONLY_INVALID, "Reduce only order increases exposure");
        }
    }

    //    ORDERBOOK RULES

    private validateOrderbookRules(order: normalizeIncomingOrderType) {

        const orderbook = this.state.orderbooks.get(order.marketId);

        if (!orderbook) {

            return this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Orderbook missing");
        }

        const userOrders = orderbook.userOrders.get(order.userId);

        if (userOrders && userOrders.size >= 100) {

            return this.reject(EVENT_REJECT_CODES.MAX_OPEN_ORDERS, "Too many open orders");
        }


        //    POST ONLY VALIDATION


        if (order.postOnly && order.type === OrderType.LIMIT) {

            const bestAsk = this.getBestAsk(orderbook);

            const bestBid = this.getBestBid(orderbook);

            if (order.side === OrderSide.BUY && bestAsk !== null && order.entryPrice! >= bestAsk) {

                return this.reject(EVENT_REJECT_CODES.POST_ONLY_WOULD_TRADE, "Post only order would execute immediately");
            }

            if (order.side === OrderSide.SELL && bestBid !== null && order.entryPrice! <= bestBid) {

                return this.reject(EVENT_REJECT_CODES.POST_ONLY_WOULD_TRADE, "Post only order would execute immediately");
            }
        }


        //    STP RULES


        if (order.type === OrderType.MARKET) {
            return;
        }

        if (!userOrders) {
            return;
        }

        const stpMode = order.stpMode || STPMode.CANCEL_TAKER;

        userOrders.forEach((orderId: string) => {

            const node = orderbook.orderMap.get(orderId);

            if (!node) return;

            const resting = node.order;

            const crosses = order.side === OrderSide.BUY
                ? order.entryPrice! >= resting.entryPrice!
                : order.entryPrice! <= resting.entryPrice!;

            if (crosses && resting.side !== order.side) {

                switch (stpMode) {

                    case STPMode.CANCEL_TAKER:

                        return this.reject(EVENT_REJECT_CODES.STP_TRIGGERED, "STP cancel taker triggered");

                    case STPMode.CANCEL_MAKER:

                        /*
                          Matching engine should
                          cancel resting maker
                        */

                        break;

                    case STPMode.CANCEL_BOTH:

                        return this.reject(EVENT_REJECT_CODES.STP_TRIGGERED, "STP cancel both triggered");
                }
            }
        }
        );
    }

    //    RISK RULES

    private validateRiskRules(order: normalizeIncomingOrderType, market: Market) {

        //    MARKET LIQUIDITY

        if (order.type === OrderType.MARKET) {

            const liquidity = this.getAvailableLiquidity(order);

            if (liquidity < order.quantity) {

                return this.reject(EVENT_REJECT_CODES.NO_LIQUIDITY, "Insufficient market liquidity");
            }
        }

        //    SPOT

        if (order.marketType !== MarketType.PERP) {
            const userBalances = this.state.balances.get(order.userId);

            if (!userBalances) {

                return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "User balances not found");
            }

            // SPOT BUY
            // Needs quote asset balance

            if (order.side === OrderSide.BUY) {

                if (typeof order.entryPrice === "undefined") {

                    return this.reject(EVENT_REJECT_CODES.INVALID_PRICE, "Spot limit buy requires price");
                }

                const quoteBalance = userBalances.get(market.quoteAsset);

                if (!quoteBalance) {

                    return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "Quote asset balance missing");
                }

                const requiredQuote = order.entryPrice * order.quantity;

                const availableQuote = this.availableBalance(quoteBalance.total, quoteBalance.locked);

                if (availableQuote < requiredQuote) {

                    return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "Insufficient quote balance");
                }
            }

            // SPOT SELL
            // Needs base asset balance

            if (order.side === OrderSide.SELL) {

                const baseBalance = userBalances.get(market.baseAsset);

                if (!baseBalance) {

                    return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "Base asset balance missing");
                }

                const availableBase = this.availableBalance(baseBalance.total, baseBalance.locked);

                if (availableBase < order.quantity) {

                    return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "Insufficient base asset balance");
                }
            }

            return;
        }

        if (typeof order.entryPrice === "undefined") {
            return;
        }

        //    PERP MARGIN

        const notional = order.entryPrice * order.quantity;

        const requiredMargin = notional / BigInt(order.leverage);

        const collateralAsset = market.quoteAsset;

        const userBalances = this.state.balances.get(order.userId);

        if (!userBalances) {

            return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_MARGIN, "User balance not found");
        }

        const collateralBalance = userBalances.get(collateralAsset);

        if (!collateralBalance) {

            return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_MARGIN, "Collateral balance missing");
        }

        if (this.availableBalance(collateralBalance.total, collateralBalance.locked) < requiredMargin) {

            return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_MARGIN, "Insufficient margin");
        }
    }

    //    LIQUIDITY

    private getAvailableLiquidity(order: normalizeIncomingOrderType): bigint {

        const orderbook = this.state.orderbooks.get(order.marketId);

        if (!orderbook) { return 0n; }

        let liquidity = 0n;

        const levels = order.side === OrderSide.BUY
            ? orderbook.asks
            : orderbook.bids;

        levels.forEach((level: OrderList) => {

            if (level.totalQty <= 0n) {
                return;
            }

            liquidity += level.totalQty;
        }
        );

        return liquidity;
    }

    //    ORDER ID VALIDATION

    private validateOrderId(orderId: OrderId) {

        const marketId = this.state.orderMap.get(orderId);

        if (!marketId) {

            this.reject(EVENT_REJECT_CODES.ORDER_NOT_FOUND, "Order not found");
        }

        const orderbook = this.state.orderbooks.get(marketId);

        if (!orderbook) {

            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Orderbook not found");
        }

        const orderNode = orderbook.orderMap.get(orderId);

        if (!orderNode) {

            this.reject(EVENT_REJECT_CODES.ORDER_NOT_FOUND, "Order node missing");
        }
    }

    //    BEST BID / ASK

    private getBestAsk(orderbook: any): bigint | null {

        const node = orderbook.askTree.begin;

        return node.valid ? node.key : null;
    }

    private getBestBid(orderbook: any): bigint | null {

        const node = orderbook.bidTree.end;

        return node.valid ? node.key : null;
    }

    //    HELPERS

    private availableBalance(total: bigint, locked: bigint): bigint {

        return total - locked;
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {

        throw new RejectError(code, message);
    }
}