// single-orderbook.ts

import createRBTree from "functional-red-black-tree";

import {
    CancelOrderPayload,
    DepthType,
    EVENT_REJECT_CODES,
    FillStatus,
    FillType,
    GetOrderByIdPayload,
    InMarketFillType,
    InMarketOrderType,
    Market,
    OrderId,
    OrderList,
    OrderNode,
    OrderSide,
    OrderStatus,
    OrderType,
    STPMode,
    TimeInForce,
} from "@workspace/types";

import { RejectError } from "../utils/error";
import { formatBigInt } from "../utils/parse-incoming";
import type { BalanceEngine } from "./balance-engine";


function remaining(order: InMarketOrderType) {
    return order.quantity - order.filled;
}

function minBigInt(a: bigint, b: bigint) {
    return a < b ? a : b;
}

export class SingleMarketOrderBook {
    readonly market: Market;

    bids = new Map<bigint, OrderList>();
    asks = new Map<bigint, OrderList>();

    bidTree = createRBTree<bigint, boolean>();
    askTree = createRBTree<bigint, boolean>();

    orderMap = new Map<OrderId, OrderNode>();

    userOrders = new Map<string, Set<OrderId>>();

    private tradeId = 0n;

    private lastTradePrice = 0n;

    private autoCancelledOrders: InMarketOrderType[] = [];

    private matchedOrders = new Map<OrderId, InMarketOrderType>();

    constructor(
        market: Market,
        private readonly globalOrderMap: Map<OrderId, string>,
        private readonly globalOrders: Map<OrderId, InMarketOrderType>,
        private readonly balanceEngine: BalanceEngine
    ) {
        this.market = market;
    }

    addOrder(order: InMarketOrderType) {
        this.autoCancelledOrders = [];
        this.matchedOrders = new Map();
        this.validateOrder(order);

        if (order.timeInForce === TimeInForce.FOK) {
            const executable = this.calculateExecutableQty(order);

            if (executable < remaining(order)) {
                order.status = OrderStatus.CANCELLED;

                return order;
            }
        }

        if (order.postOnly && this.wouldCross(order)) {
            order.status = OrderStatus.REJECTED;
            return order;
        }

        return this.match(order);
    }

    consumeAutoCancelledOrders() {
        const cancelledOrders = this.autoCancelledOrders;
        this.autoCancelledOrders = [];
        return cancelledOrders;
    }

    consumeMatchedOrders() {
        const matchedOrders = this.matchedOrders;
        this.matchedOrders = new Map();
        return matchedOrders;
    }

    cancelOrder(payload: CancelOrderPayload) {
        const node = this.orderMap.get(payload.orderId);

        if (!node) {
            this.reject(EVENT_REJECT_CODES.ORDER_NOT_FOUND, "Order not found");
        }

        const order = node.order;

        if (order.userId !== payload.userId) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Unauthorized");
        }

        const levels = order.side === OrderSide.BUY ? this.bids : this.asks;

        const level = levels.get(order.entryPrice);

        if (!level) {
            this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Level missing");
        }

        level.remove(node);

        this.recordDepthChange(order, order.side, order.entryPrice, level.totalQty);

        this.orderMap.delete(order.orderId);

        this.globalOrderMap.delete(order.orderId);
        this.globalOrders.delete(order.orderId);

        this.removeUserOrder(order.userId, order.orderId);

        order.status = OrderStatus.CANCELLED;

        if (level.size === 0) {
            levels.delete(order.entryPrice);

            if (order.side === OrderSide.BUY) {
                this.bidTree = this.bidTree.remove(order.entryPrice);
            } else {
                this.askTree = this.askTree.remove(order.entryPrice);
            }
        }

        return order;
    }

    getUserOrderByID(payload: GetOrderByIdPayload) {
        const node = this.orderMap.get(payload.orderId);

        if (!node) {
            this.reject(EVENT_REJECT_CODES.ORDER_NOT_FOUND, "Order not found");
        }

        return node.order;
    }

    getUserOpenOrders(userId: string) {
        const ids = this.userOrders.get(userId);

        if (!ids) { return []; }

        const result: InMarketOrderType[] = [];

        for (const id of ids) {
            const node = this.orderMap.get(id);

            if (node) { result.push(node.order); }
        }

        return result;
    }

    restoreOrder(order: InMarketOrderType) {
        if (remaining(order) <= 0n) {
            return;
        }

        this.restOrder(order, false);
    }

    private match(taker: InMarketOrderType) {
        const fills: InMarketFillType[] = [];
        let reservationRejected = false;

        while (remaining(taker) > 0n) {
            const bestPrice = this.getBestOppositePrice(taker.side);

            if (bestPrice === undefined) { break; }

            if (!this.priceCross(taker, bestPrice)) { break; }

            const makerLevels = taker.side === OrderSide.BUY ? this.asks : this.bids;

            const level = makerLevels.get(bestPrice);

            if (!level) { break; }

            let current = level.head;

            while (current && remaining(taker) > 0n) {
                const maker = current.order;

                const next = current.next;

                if (maker.userId === taker.userId) {

                    const shouldStop = this.handleSTP(taker, maker, current, level);

                    if (shouldStop) {
                        current = null;
                        break;
                    }

                    current = next;
                    continue;
                }

                const makerRemaining = remaining(maker);

                const requestedQty = minBigInt(remaining(taker), makerRemaining);
                const prepared = this.balanceEngine.prepareFill(maker, taker, requestedQty, bestPrice);
                const tradeQty = prepared.qty;

                if (tradeQty <= 0n) {
                    reservationRejected = prepared.reservationRejected;
                    current = null;
                    break;
                }

                maker.filled += tradeQty;

                taker.filled += tradeQty;
                maker.remainingQty = remaining(maker);

                this.tradeId++;

                this.lastTradePrice = bestPrice;

                const fill: InMarketFillType = {
                    tradeId: this.tradeId,
                    makerOrderId: maker.orderId,
                    takerOrderId: taker.orderId,
                    makerUserId: maker.userId,
                    side: maker.side,
                    marketId: maker.marketId,
                    takerUserId: taker.userId,
                    qty: tradeQty,
                    price: bestPrice,
                    timestamp: Date.now(),
                    status: FillStatus.TRADE,
                };

                fills.push(fill);
                maker.fills.push(fill);
                this.matchedOrders.set(maker.orderId, maker);
                this.matchedOrders.set(taker.orderId, taker);

                const totalNotional = taker.averagePrice * (taker.filled - tradeQty) + bestPrice * tradeQty;
                taker.averagePrice = taker.filled === 0n ? 0n : totalNotional / taker.filled;

                const makerTotalNotional = maker.averagePrice * (maker.filled - tradeQty) + bestPrice * tradeQty;
                maker.averagePrice = maker.filled === 0n ? 0n : makerTotalNotional / maker.filled;

                level.decreaseQty(tradeQty);

                if (remaining(maker) === 0n) {
                    maker.status = OrderStatus.FILLED;

                    level.remove(current);

                    this.orderMap.delete(maker.orderId);

                    this.globalOrderMap.delete(
                        maker.orderId
                    );
                    this.globalOrders.delete(maker.orderId);

                    this.removeUserOrder(
                        maker.userId,
                        maker.orderId
                    );
                } else {
                    maker.status = OrderStatus.PARTIAL_FILLED;
                }

                this.recordDepthChange(taker, maker.side, bestPrice, level.totalQty);

                if (prepared.reservationRejected) {
                    reservationRejected = true;
                    current = null;
                    break;
                }

                current = next;
            }

            if (taker.status === OrderStatus.CANCELLED || reservationRejected) {
                break;
            }

            if (level.size === 0) {
                makerLevels.delete(bestPrice);

                if (taker.side === OrderSide.BUY) {
                    this.askTree = this.askTree.remove(bestPrice);
                } else {
                    this.bidTree = this.bidTree.remove(bestPrice);
                }
            }
        }

        if (reservationRejected) {
            taker.status = taker.filled > 0n ? OrderStatus.PARTIAL_REJECTED : OrderStatus.REJECTED;
            taker.remainingQty = remaining(taker);
        } else if (taker.status === OrderStatus.CANCELLED) {
            taker.remainingQty = remaining(taker);
        } else if (remaining(taker) > 0n) {
            if (
                taker.type === OrderType.MARKET ||
                taker.timeInForce === TimeInForce.IOC ||
                taker.timeInForce === TimeInForce.FOK
            ) {
                taker.status = taker.filled > 0n ? OrderStatus.PARTIAL_FILLED : OrderStatus.CANCELLED;
            } else {
                this.restOrder(taker);

                taker.status =
                    taker.filled > 0n
                        ? OrderStatus.PARTIAL_FILLED
                        : OrderStatus.OPEN;
            }
        } else {
            taker.status = OrderStatus.FILLED;
        }

        taker.fills = fills;

        taker.remainingQty = remaining(taker);

        return taker;
    }

    private restOrder(order: InMarketOrderType, shouldTrackDepth = true) {
        const levels = order.side === OrderSide.BUY ? this.bids : this.asks;

        let tree = order.side === OrderSide.BUY ? this.bidTree : this.askTree;

        let level = levels.get(order.entryPrice);

        if (!level) {
            level = new OrderList();

            levels.set(order.entryPrice, level);

            tree = tree.insert(order.entryPrice, true);

            if (order.side === OrderSide.BUY) {
                this.bidTree = tree;
            } else {
                this.askTree = tree;
            }
        }

        const node = level.append(order);

        if (shouldTrackDepth) {
            this.recordDepthChange(order, order.side, order.entryPrice, level.totalQty);
        }

        this.orderMap.set(order.orderId, node);

        this.globalOrderMap.set(order.orderId, order.marketId);
        this.globalOrders.set(order.orderId, order);

        this.addUserOrder(order.userId, order.orderId);
    }

    private calculateExecutableQty(order: InMarketOrderType) {
        let executable = 0n;

        let remainingQty = remaining(order);

        let iter = order.side === OrderSide.BUY
            ? this.askTree.begin
            : this.bidTree.end;

        while (iter && iter.valid && remainingQty > 0n) {
            const price = iter.key;

            if (price === undefined) {
                break;
            }

            if (!this.priceCross(order, price)) {
                break;
            }

            const level = order.side === OrderSide.BUY
                ? this.asks.get(price)
                : this.bids.get(price);

            if (!level) { break; }

            let executableAtLevel = 0n;
            let current = level.head;

            while (current) {
                if (current.order.userId !== order.userId) {
                    executableAtLevel += remaining(current.order);
                }
                current = current.next;
            }

            const fillableQty = minBigInt(executableAtLevel, remainingQty);
            executable += fillableQty;
            remainingQty -= fillableQty;

            if (order.side === OrderSide.BUY) {
                iter.next();
            } else {
                iter.prev();
            }
        }

        return executable;
    }

    private wouldCross(order: InMarketOrderType) {
        const best = order.side === OrderSide.BUY
            ? this.askTree.begin
            : this.bidTree.end;

        if (!best || !best.valid) {
            return false;
        }

        const bestPrice = best.key;

        if (bestPrice === undefined) {
            return false;
        }

        if (order.side === OrderSide.BUY) {
            return order.entryPrice >= bestPrice;
        }

        return order.entryPrice <= bestPrice;
    }

    private getBestOppositePrice(side: OrderSide): bigint | undefined {
        if (side === OrderSide.BUY) {
            const best = this.askTree.begin;

            return best.valid ? best.key : undefined;
        }

        const best = this.bidTree.end;
        return best.valid ? best.key : undefined;
    }

    private priceCross(order: InMarketOrderType, bestPrice: bigint) {
        if (order.type === OrderType.MARKET) {
            return true;
        }

        if (order.side === OrderSide.BUY) {
            return order.entryPrice >= bestPrice;
        }

        return order.entryPrice <= bestPrice;
    }

    private handleSTP(taker: InMarketOrderType, maker: InMarketOrderType, makerNode: OrderNode, level: OrderList): boolean {
        const mode = taker.stpMode || STPMode.CANCEL_TAKER;

        switch (mode) {
            case STPMode.CANCEL_TAKER:
                taker.status = OrderStatus.CANCELLED;
                return true;

            case STPMode.CANCEL_MAKER:
                maker.status = OrderStatus.CANCELLED;
                this.autoCancelledOrders.push(maker);
                level.remove(makerNode);
                this.recordDepthChange(taker, maker.side, maker.entryPrice, level.totalQty);
                this.orderMap.delete(maker.orderId);
                this.globalOrderMap.delete(maker.orderId);
                this.globalOrders.delete(maker.orderId);
                this.removeUserOrder(maker.userId, maker.orderId);
                return false;

            case STPMode.CANCEL_BOTH:
                taker.status = OrderStatus.CANCELLED;
                maker.status = OrderStatus.CANCELLED;
                this.autoCancelledOrders.push(maker);
                level.remove(makerNode);
                this.recordDepthChange(taker, maker.side, maker.entryPrice, level.totalQty);
                this.orderMap.delete(maker.orderId);
                this.globalOrderMap.delete(maker.orderId);
                this.globalOrders.delete(maker.orderId);
                this.removeUserOrder(maker.userId, maker.orderId);
                return true;
        }

        return true;
    }

    private validateOrder(order: InMarketOrderType) {

        if (order.quantity <= 0n) {
            this.reject(EVENT_REJECT_CODES.INVALID_QUANTITY, "Invalid quantity");
        }

        if (order.entryPrice <= 0n) {
            this.reject(EVENT_REJECT_CODES.INVALID_PRICE, "Invalid price");
        }

        if (order.type === OrderType.MARKET && order.timeInForce === TimeInForce.GTC) {
            this.reject(EVENT_REJECT_CODES.MARKET_ORDER_GTC, "Market order cannot be GTC");
        }
    }

    getDepth(levels = 20): { bids: DepthType[]; asks: DepthType[]; } {
        const bids: DepthType[] = [];

        const asks: DepthType[] = [];

        const bidIter = this.bidTree.end;

        while (bidIter.valid && bids.length < levels) {
            const price = bidIter.key;

            if (price !== undefined) {
                const level = this.bids.get(price);

                if (level) {
                    bids.push({
                        price: formatBigInt(price, this.market.quoteAsset.precision),
                        quantity: formatBigInt(level.totalQty, this.market.baseAsset.precision),
                    });
                }
            }

            bidIter.prev();
        }

        const askIter = this.askTree.begin;

        while (askIter.valid && asks.length < levels) {
            const price = askIter.key;

            if (price !== undefined) {
                const level = this.asks.get(price);

                if (level) {
                    asks.push({
                        price: formatBigInt(price, this.market.quoteAsset.precision),
                        quantity: formatBigInt(level.totalQty, this.market.baseAsset.precision),
                    });
                }
            }

            askIter.next();
        }

        return { bids, asks };
    }

    private addUserOrder(userId: string, orderId: OrderId) {
        let orders = this.userOrders.get(userId);

        if (!orders) {
            orders = new Set();

            this.userOrders.set(userId, orders);
        }

        orders.add(orderId);
    }

    private removeUserOrder(userId: string, orderId: OrderId) {
        const orders = this.userOrders.get(userId);

        if (!orders) { return; }

        orders.delete(orderId);

        if (orders.size === 0) {
            this.userOrders.delete(userId);
        }
    }

    private recordDepthChange(order: InMarketOrderType, side: OrderSide, price: bigint, quantity: bigint) {
        const depths = side === OrderSide.BUY ? order.depths.bids : order.depths.asks;
        const priceKey = price.toString();
        const existing = depths.find(depth => depth.price === priceKey);

        if (existing) {
            existing.quantity = quantity.toString();
            return;
        }

        depths.push({
            price: priceKey,
            quantity: quantity.toString(),
        });
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
