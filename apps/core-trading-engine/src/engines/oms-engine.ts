import { BaseReturnPayload, CancelOrderPayload, CreateOrderPayload, EVENT_REJECT_CODES, GetDepthPayload, GetOrderByIdPayload, GetUserOpenOrdersPayload, Market, MarketsType, MarketType, OnRampPayload, OrderId, OrderList, OrderSide, OrderType, STPMode, TimeInForce } from "@workspace/types";
import { BALANCES, baseAsset, MARKETS, ORDERBOOKS, ORDERMAP, POSITIONS, quoteAsset } from "./core-engine";
import { OrderBook } from "./matching-engine";
import { RejectError } from "../utils/error";
import { assert } from "console";

export class OMSEngine {

    OrderbookEngine: OrderBook = new OrderBook()

    createOrderChecks(order: CreateOrderPayload) {

        const market = this.validateMarket(order.marketId);

        this.validateBasicOrder(order);

        this.validateTIF(order);

        this.validateMarketConstraints(order, market);

        this.validatePositionRules(order);

        this.validateOrderbookRules(order);

        this.validateRiskRules(order);

    }

    UserBalanceCheck(payload: OnRampPayload) {
        const inBase = baseAsset.includes(payload.asset);
        const inQuote = quoteAsset.includes(payload.asset);

        if (inBase || inQuote) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "No asset found in the market");
        }
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

    private validateMarket(marketId: string) {

        const market = MARKETS.get(marketId);

        if (!market) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_MARKET,
                "Invalid market"
            );
        }

        return market;
    }

    private validateBasicOrder(order: CreateOrderPayload) {

        if (
            order.side !== OrderSide.LONG &&
            order.side !== OrderSide.SHORT
        ) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_SIDE,
                "Invalid side"
            );
        }

        if (
            order.type !== OrderType.LIMIT &&
            order.type !== OrderType.MARKET
        ) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_ORDER_TYPE,
                "Invalid order type"
            );
        }

        if (order.quantity <= 0n) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_QUANTITY,
                "Quantity must be positive"
            );
        }

        if (
            order.type === OrderType.LIMIT &&
            typeof order.entryPrice === "undefined"
        ) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_PRICE,
                "Limit order requires price"
            );
        }

        if (
            typeof order.entryPrice !== "undefined" &&
            order.entryPrice <= 0n
        ) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_PRICE,
                "Price must be positive"
            );
        }

        if (order.marketType === MarketType.PERP) {

            if (order.leverage <= 0) {
                return this.reject(
                    EVENT_REJECT_CODES.INVALID_LEVERAGE,
                    "Invalid leverage"
                );
            }
        }
    }

    private validateTIF(order: CreateOrderPayload) {

        if (
            order.type === OrderType.MARKET &&
            order.timeInForce === TimeInForce.GTC
        ) {
            return this.reject(
                EVENT_REJECT_CODES.MARKET_ORDER_GTC,
                "Market orders cannot use GTC"
            );
        }
    }

    private validateMarketConstraints(order: CreateOrderPayload, market: Market) {
        if (order.marketType === MarketType.PERP) {
            if (order.leverage > market.maxLeverage) {
                return this.reject(
                    EVENT_REJECT_CODES.LEVERAGE_EXCEEDED,
                    "Leverage exceeds limit"
                );
            }
        }

        if (order.quantity < market.minQty) {
            return this.reject(
                EVENT_REJECT_CODES.BELOW_MIN_QTY,
                "Quantity below minimum"
            );
        }

        if (order.quantity % market.lotSize !== 0n) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_LOT_SIZE,
                "Invalid lot size"
            );
        }

        if (
            typeof order.entryPrice !== "undefined" &&
            order.entryPrice % market.tickSize !== 0n
        ) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_TICK_SIZE,
                "Invalid tick size"
            );
        }

        if (typeof order.entryPrice !== "undefined") {

            const notional = order.entryPrice * order.quantity;

            if (notional < market.minNotional) {
                return this.reject(
                    EVENT_REJECT_CODES.BELOW_MIN_NOTIONAL,
                    "Below minimum notional"
                );
            }
        }
    }

    private validatePositionRules(order: CreateOrderPayload) {

        const marketPositions = POSITIONS.get(order.marketId);

        if (!marketPositions) return;

        const position = marketPositions.get(order.userId);

        if (!position) {

            if (order.marketType === MarketType.PERP && order.reduceOnly) {
                return this.reject(
                    EVENT_REJECT_CODES.REDUCE_ONLY_INVALID,
                    "No position to reduce"
                );
            }

            return;
        }

        if (order.marketType === MarketType.PERP && order.reduceOnly) {

            if (position.side === OrderSide.LONG && order.side === OrderSide.LONG) {
                return this.reject(
                    EVENT_REJECT_CODES.REDUCE_ONLY_INVALID,
                    "Reduce only cannot increase long"
                );
            }

            if (position.side === OrderSide.SHORT && order.side === OrderSide.SHORT) {
                return this.reject(
                    EVENT_REJECT_CODES.REDUCE_ONLY_INVALID,
                    "Reduce only cannot increase short"
                );
            }
        }
    }

    private validateOrderbookRules(order: CreateOrderPayload) {

        const orderbook = ORDERBOOKS.get(order.marketId);

        if (!orderbook) {
            return this.reject(
                EVENT_REJECT_CODES.INVALID_MARKET,
                "Orderbook missing"
            );
        }

        const userOrders = orderbook.userOrders.get(order.userId);

        if (userOrders && userOrders.size >= 100) {
            return this.reject(
                EVENT_REJECT_CODES.MAX_OPEN_ORDERS,
                "Too many open orders"
            );
        }

        if (order.postOnly && order.type === OrderType.LIMIT) {

            const bestAsk = this.OrderbookEngine.getBestAsk();
            const bestBid = this.OrderbookEngine.getBestBid();

            if (order.side === OrderSide.LONG && bestAsk && order.entryPrice! >= bestAsk) {
                return this.reject(
                    EVENT_REJECT_CODES.POST_ONLY_WOULD_TRADE,
                    "Post only order would execute immediately"
                );
            }

            if (order.side === OrderSide.SHORT && bestBid && order.entryPrice! <= bestBid) {
                return this.reject(
                    EVENT_REJECT_CODES.POST_ONLY_WOULD_TRADE,
                    "Post only order would execute immediately"
                );
            }
        }

        if (!userOrders) return;

        const stpMode = order.stpMode || STPMode.CANCEL_TAKER;

        userOrders.forEach((orderId: string) => {

            const node = orderbook.orderMap.get(orderId);

            if (!node) return;

            const resting = node.order;

            const crosses =
                order.side === OrderSide.LONG
                    ? order.entryPrice! >= resting.entryPrice!
                    : order.entryPrice! <= resting.entryPrice!;

            if (crosses && resting.side !== order.side) {

                switch (stpMode) {

                    case STPMode.CANCEL_TAKER:
                        return this.reject(
                            EVENT_REJECT_CODES.STP_TRIGGERED,
                            "STP cancel taker triggered"
                        );

                    case STPMode.CANCEL_MAKER:
                        /*
                           matching engine should cancel resting order
                        */
                        // this.OrderbookEngine.cancelOrder({
                        // userId: resting.userId,
                        // orderId:resting.orderId})

                        break;

                    case STPMode.CANCEL_BOTH:
                        return this.reject(
                            EVENT_REJECT_CODES.STP_TRIGGERED,
                            "STP cancel both triggered"
                        );
                }
            }
        });
    }

    private validateRiskRules(order: CreateOrderPayload) {

        if (order.type === OrderType.MARKET) {

            const liquidity = this.getAvailableLiquidity(order);

            if (liquidity < order.quantity) {
                return this.reject(
                    EVENT_REJECT_CODES.NO_LIQUIDITY,
                    "Insufficient market liquidity"
                );
            }
        }

        if (order.marketType !== MarketType.PERP) {
            return;
        }

        if (typeof order.entryPrice === "undefined") {
            return;
        }

        const notional = order.entryPrice * order.quantity;

        const requiredMargin = notional / BigInt(order.leverage);

        const asset = order.marketId.split("_")[0]!;

        const userBalances = BALANCES.get(order.userId);

        if (!userBalances) {
            return this.reject(
                EVENT_REJECT_CODES.INSUFFICIENT_MARGIN,
                "User Balance not found"
            );
        }

        const assetBalance = userBalances.get(asset);

        if (!assetBalance) {
            return this.reject(
                EVENT_REJECT_CODES.INSUFFICIENT_MARGIN,
                "User Asset Balance not found"
            );
        }

        if (this.availableBalance(assetBalance.total, assetBalance.locked) < requiredMargin) {
            return this.reject(
                EVENT_REJECT_CODES.INSUFFICIENT_MARGIN,
                "Insufficient margin"
            );
        }
    }

    private getAvailableLiquidity(order: CreateOrderPayload): bigint {

        const orderbook = ORDERBOOKS.get(order.marketId);

        if (!orderbook) return 0n;

        let liquidity = 0n;

        const list = order.side === OrderSide.LONG ? orderbook.asks : orderbook.bids;

        list.forEach((level: OrderList) => { liquidity += level.totalQty; });

        return liquidity;
    }

    private validateOrderId(orderId: OrderId) {
        const marketId = ORDERMAP.get(orderId);

        if (!marketId) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "No market name found");
        }

        const market = this.validateMarket(marketId);

        const orderbook = ORDERBOOKS.get(market.id);

        if (!orderbook) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "No orderbook found for the market");
        }

        const orderNode = orderbook.orderMap.get(orderId);

        if (!orderNode) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Ordernode not found");
        }
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }

    private availableBalance(total: bigint, locked: bigint): bigint {
        return total - locked;
    }

}

