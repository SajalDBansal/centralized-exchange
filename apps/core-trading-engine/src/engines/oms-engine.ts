import {
    AddMarketAssetPayload,
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
import { parseBigInt, perpMargin, quoteNotional, normalizeOrderIncoming, normalizeOnRampPayload } from "../utils/parse-incoming";

export class OMSEngine {

    constructor(private readonly state: EngineState) { }

    // PUBLIC CHECKS

    createOrderChecks(order: CreateOrderPayload) {
        const market = this.validateMarket(order.marketId);

        const parsed = normalizeOrderIncoming(order, market);

        this.validateBasicOrder(parsed);

        if (parsed.marketType === MarketType.PERP) {
            parsed.margin = perpMargin(parsed.quantity, parsed.entryPrice, parsed.leverage, market);
        }

        this.validateTIF(parsed);

        this.validateMarketConstraints(parsed, market);

        this.validatePositionRules(parsed);

        this.validateOrderbookRules(parsed);

        this.validateRiskRules(parsed, market);

        return parsed;
    }

    UserBalanceCheck(payload: OnRampPayload): NormalizeOnRampType {
        const asset = this.state.assets.get(payload.assetId);

        if (!asset) {
            this.reject(EVENT_REJECT_CODES.INVALID_ASSET, "Asset not found")
        }

        const parsed = normalizeOnRampPayload(payload, asset);

        this.validateAsset(parsed.assetId);

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

    private validateAsset(asset: string) {
        const supported = new Set<string>();

        for (const market of this.state.markets.values()) {
            supported.add(market.baseAsset.id);
            supported.add(market.quoteAsset.id);
        }

        if (!supported.has(asset)) {
            this.reject(
                EVENT_REJECT_CODES.INVALID_ASSET,
                "Unsupported asset"
            );
        }
    }

    deleteMarketCheck(payload: DeleteMarketPayload): Market {
        const market = this.validateMarket(payload.marketId);

        const orderbook = this.state.orderbooks.get(payload.marketId);

        if (orderbook) {
            if (orderbook.asks.size > 0 || orderbook.bids.size > 0) {
                this.reject(EVENT_REJECT_CODES.MARKET_NOT_EMPTY, "Market has open orders");
            }
        }

        if (this.state.positions.has(payload.marketId)) {
            const marketPositions = this.state.positions.get(payload.marketId);
            if (marketPositions && marketPositions.size > 0) {
                this.reject(EVENT_REJECT_CODES.MARKET_NOT_EMPTY, "Market has open positions");
            }
        }

        if (this.state.balances.size > 0) {
            for (const [userId, balances] of this.state.balances.entries()) {
                const baseBalance = balances.get(market.baseAsset.id);
                const quoteBalance = balances.get(market.quoteAsset.id);
                if ((baseBalance && baseBalance.total > 0n) || (quoteBalance && quoteBalance.total > 0n)) {
                    this.reject(EVENT_REJECT_CODES.MARKET_NOT_EMPTY, "Market has user balances");
                }
            }
        }


        return market;
    }

    addMarketCheck(payload: AddMarketPayload) {
        if (this.state.markets.has(payload.market.id)) {
            this.reject(EVENT_REJECT_CODES.MARKET_ALREADY_EXISTS, "Market already exists");
        }
    }

    addMarketAssetCheck(payload: AddMarketAssetPayload) {
        const supported = new Set<string>();

        for (const market of this.state.markets.values()) {
            supported.add(market.baseAsset.symbol);
            supported.add(market.quoteAsset.symbol);
        }

        if (supported.has(payload.asset.symbol)) {
            this.reject(EVENT_REJECT_CODES.ASSET_ALREADY_EXISTS, "Asset Already exists in a market");
        }
    }

    getMarketByIdCheck(payload: GetMarketByIdPayload): Market {
        const market = this.validateMarket(payload.marketId);
        return market;
    }

    updateMarketCheck(payload: UpdateMarketPayload) {
        const market = this.validateMarket(payload.marketId);

        if (payload.market.baseAssetId && payload.market.baseAssetId !== market.baseAsset.id) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Base asset cannot be changed");
        }
        if (payload.market.quoteAssetId && payload.market.quoteAssetId !== market.quoteAsset.id) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Quote asset cannot be changed");
        }

        if (payload.market.tickSize && payload.market.tickSize <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_TICK_SIZE, "Tick size can not be less than or equal to 0");
        }

        if (payload.market.lotSize && payload.market.lotSize <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_LOT_SIZE, "Lot size can not be less than or equal to 0");
        }

        if (payload.market.maxLeverage && payload.market.maxLeverage <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_LEVERAGE, "Max leverage can not be less than or equal to 0");
        }

        if (payload.market.minQty && payload.market.minQty <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_QUANTITY, "Min quantity can not be less than or equal to 0");
        }

        if (payload.market.minNotional && payload.market.minNotional <= 0) {
            this.reject(EVENT_REJECT_CODES.INVALID_AMOUNT, "Min notional can not be less than or equal to 0");
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

        if (order.entryPrice <= 0n) {

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

            const expectedSide = order.position === OrderPosition.LONG ? OrderSide.BUY : OrderSide.SELL;

            if (order.side !== expectedSide) {
                return this.reject(EVENT_REJECT_CODES.INVALID_POSITION, "Perp side does not match position direction");
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

        const minQty = parseBigInt(market.minQty.toString(), market.baseAsset.precision, EVENT_REJECT_CODES.INVALID_QUANTITY, "min quantity");
        const lotSize = parseBigInt(market.lotSize.toString(), market.baseAsset.precision, EVENT_REJECT_CODES.INVALID_LOT_SIZE, "lot size");
        const tickSize = parseBigInt(market.tickSize.toString(), market.quoteAsset.precision, EVENT_REJECT_CODES.INVALID_TICK_SIZE, "tick size");
        const minNotional = parseBigInt(market.minNotional.toString(), market.quoteAsset.precision, EVENT_REJECT_CODES.INVALID_AMOUNT, "min notional");

        if (order.quantity < minQty) {

            return this.reject(EVENT_REJECT_CODES.BELOW_MIN_QTY, "Quantity below minimum");
        }

        if (lotSize <= 0n || order.quantity % lotSize !== 0n) {

            return this.reject(EVENT_REJECT_CODES.INVALID_LOT_SIZE, "Invalid lot size");
        }

        if (tickSize <= 0n || order.entryPrice % tickSize !== 0n) {

            return this.reject(EVENT_REJECT_CODES.INVALID_TICK_SIZE, "Invalid tick size");
        }

        const notional = quoteNotional(order.quantity, order.entryPrice, market);

        if (notional < minNotional) {

            return this.reject(EVENT_REJECT_CODES.BELOW_MIN_NOTIONAL, "Below minimum notional");
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

        if (order.reduceOnly && order.quantity > position.quantity) {
            return this.reject(EVENT_REJECT_CODES.REDUCE_ONLY_INVALID, "Reduce only order exceeds open position");
        }

        if (order.reduceOnly && order.type === OrderType.LIMIT && order.timeInForce === TimeInForce.GTC) {
            return this.reject(EVENT_REJECT_CODES.REDUCE_ONLY_INVALID, "Reduce only orders cannot rest");
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

            if (order.side === OrderSide.BUY && bestAsk !== null && order.entryPrice >= bestAsk) {

                return this.reject(EVENT_REJECT_CODES.POST_ONLY_WOULD_TRADE, "Post only order would execute immediately");
            }

            if (order.side === OrderSide.SELL && bestBid !== null && order.entryPrice <= bestBid) {

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
                ? order.entryPrice >= resting.entryPrice
                : order.entryPrice <= resting.entryPrice;

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

                const quoteBalance = userBalances.get(market.quoteAsset.id);

                if (!quoteBalance) {

                    return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "Quote asset balance missing");
                }

                this.availableBalance(quoteBalance.total, quoteBalance.locked);
            }

            // SPOT SELL
            // Needs base asset balance

            if (order.side === OrderSide.SELL) {

                const baseBalance = userBalances.get(market.baseAsset.id);

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

        //    PERP MARGIN

        const collateralAsset = market.quoteAsset.id;

        const userBalances = this.state.balances.get(order.userId);

        if (!userBalances) {

            return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_MARGIN, "User balance not found");
        }

        const collateralBalance = userBalances.get(collateralAsset);

        if (!collateralBalance) {

            return this.reject(EVENT_REJECT_CODES.INSUFFICIENT_MARGIN, "Collateral balance missing");
        }

        this.availableBalance(collateralBalance.total, collateralBalance.locked);
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

            let current = level.head;

            while (current) {
                if (current.order.userId !== order.userId) {
                    liquidity += current.order.quantity - current.order.filled;
                }
                current = current.next;
            }
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
