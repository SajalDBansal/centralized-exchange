import {
    EVENT_REJECT_CODES,
    InMarketFillType,
    InMarketOrderType,
    Market,
    MarketType,
    OrderPosition,
    OrderSide,
    UserPositionType,
} from "@workspace/types";
import cuid from "cuid";
import { RejectError } from "../utils/error";
import { EngineState } from "./core-engine";
import { perpMargin } from "../utils/parse-incoming";

export class Position {
    constructor(private readonly state: EngineState) { }

    applyFill(fill: InMarketFillType) {
        const market = this.state.markets.get(fill.marketId);
        const makerOrder = this.state.orders.get(fill.makerOrderId);
        const takerOrder = this.state.orders.get(fill.takerOrderId);

        if (!market || !makerOrder || !takerOrder) {
            this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Perp fill context missing");
        }

        if (makerOrder.marketType !== MarketType.PERP || takerOrder.marketType !== MarketType.PERP) {
            return;
        }

        this.applyOrderFill(makerOrder, fill.makerUserId, fill.qty, fill.price, market);
        this.applyOrderFill(takerOrder, fill.takerUserId, fill.qty, fill.price, market);
    }

    private applyOrderFill(order: InMarketOrderType, userId: string, qty: bigint, price: bigint, market: Market) {
        if (order.marketType !== MarketType.PERP) {
            return;
        }

        const side = this.positionFromOrder(order);
        const positions = this.getMarketPositions(order.marketId);
        const current = positions.get(userId);
        const fillMargin = perpMargin(qty, price, order.leverage, market);

        if (!current) {
            positions.set(userId, this.createPosition(userId, order, side, qty, price, fillMargin));
            return;
        }

        if (current.position === side) {
            const nextQty = current.quantity + qty;
            current.averagePrice = ((current.averagePrice * current.quantity) + (price * qty)) / nextQty;
            current.entryPrice = current.averagePrice;
            current.quantity = nextQty;
            current.margin += fillMargin;
            current.leverage = order.leverage;
            current.liquidationPrice = this.liquidationPrice(current.averagePrice, current.leverage, side);
            return;
        }

        const closingQty = qty < current.quantity ? qty : current.quantity;
        const releasedMargin = current.quantity === 0n ? 0n : (current.margin * closingQty) / current.quantity;
        const pnl = this.realizedPnl(current.position, current.averagePrice, price, closingQty);

        this.releasePerpCollateral(userId, market.quoteAsset.id, releasedMargin, pnl);

        if (qty < current.quantity) {
            current.quantity -= qty;
            current.margin -= releasedMargin;
            current.liquidationPrice = this.liquidationPrice(current.averagePrice, current.leverage, current.position);
            return;
        }

        if (qty === current.quantity) {
            positions.delete(userId);
            return;
        }

        const flippedQty = qty - current.quantity;
        positions.set(userId, this.createPosition(
            userId,
            order,
            side,
            flippedQty,
            price,
            perpMargin(flippedQty, price, order.leverage, market)
        ));
    }

    private createPosition(
        userId: string,
        order: Extract<InMarketOrderType, { marketType: MarketType.PERP; }>,
        position: OrderPosition,
        quantity: bigint,
        price: bigint,
        margin: bigint
    ): UserPositionType {
        return {
            userId: userId,
            positionId: cuid(),
            orderId: order.orderId,
            market: order.marketId,
            side: order.side,
            position,
            leverage: order.leverage,
            margin,
            averagePrice: price,
            quantity,
            liquidationPrice: this.liquidationPrice(price, order.leverage, position),
            entryPrice: price,
            upnl: 0n,
        };
    }

    private positionFromOrder(order: InMarketOrderType): OrderPosition {
        if (order.marketType === MarketType.PERP && order.position) {
            return order.position;
        }

        return order.side === OrderSide.BUY ? OrderPosition.LONG : OrderPosition.SHORT;
    }

    private getMarketPositions(marketId: string) {
        let positions = this.state.positions.get(marketId);

        if (!positions) {
            positions = new Map();
            this.state.positions.set(marketId, positions);
        }

        return positions;
    }

    private releasePerpCollateral(userId: string, asset: string, marginToUnlock: bigint, pnl: bigint) {
        if (marginToUnlock === 0n && pnl === 0n) {
            return;
        }

        const balances = this.state.balances.get(userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.USER_NOT_FOUND, "User not found");
        }

        let balance = balances.get(asset);

        if (!balance) {
            balance = { total: 0n, locked: 0n };
            balances.set(asset, balance);
        }

        if (marginToUnlock > 0n) {
            balance.locked = marginToUnlock > balance.locked ? 0n : balance.locked - marginToUnlock;
        }

        balance.total += pnl;
    }

    private realizedPnl(position: OrderPosition, entryPrice: bigint, exitPrice: bigint, qty: bigint) {
        if (position === OrderPosition.LONG) {
            return (exitPrice - entryPrice) * qty;
        }

        return (entryPrice - exitPrice) * qty;
    }

    private liquidationPrice(price: bigint, leverage: number, position: OrderPosition) {
        const move = price / BigInt(leverage);

        if (position === OrderPosition.LONG) {
            return price > move ? price - move : 0n;
        }

        return price + move;
    }

    private numericId(value: string) {
        let acc = 0n;

        for (const char of value) {
            acc = (acc * 31n + BigInt(char.charCodeAt(0))) % 9_000_000_000_000_000_000n;
        }

        return acc;
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
