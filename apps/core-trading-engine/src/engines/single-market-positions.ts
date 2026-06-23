import createRBTree from "functional-red-black-tree";
import {
    BalancesType,
    EVENT_REJECT_CODES,
    FundingPayment,
    InMarketOrderType,
    Market,
    MarketType,
    OrderPosition,
    OrderSide,
    PerpInMarketOrder,
    UserId,
    UserPositionType,
} from "@workspace/types";
import cuid from "cuid";
import { RejectError } from "../utils/error";
import { ceilDiv, perpMargin, precisionMultiplier, quoteNotional } from "../utils/parse-incoming";

export class SingleMarketPositions {
    private readonly positionsByUserId = new Map<UserId, UserPositionType>();

    private readonly positionsById = new Map<string, UserPositionType>();

    private readonly longLiquidationBuckets = new Map<bigint, Set<string>>();

    private readonly shortLiquidationBuckets = new Map<bigint, Set<string>>();

    private longLiquidationTree = createRBTree<bigint, boolean>();

    private shortLiquidationTree = createRBTree<bigint, boolean>();

    constructor(
        readonly market: Market,
        private readonly balances: BalancesType,
        private readonly insuranceFunds: Map<string, bigint>,
        private readonly fundingPayments: FundingPayment[]
    ) { }

    get size() {
        return this.positionsById.size;
    }

    get(userId: UserId) {
        return this.positionsByUserId.get(userId);
    }

    getByPositionId(positionId: string) {
        return this.positionsById.get(positionId);
    }

    entries() {
        return this.positionsByUserId.entries();
    }

    values() {
        return this.positionsById.values();
    }

    restore(position: UserPositionType) {
        this.updateDerivedFields(position);
        this.setPosition(position);
    }

    applyOrderFill(order: PerpInMarketOrder, userId: UserId, qty: bigint, price: bigint) {
        const side = order.position;
        const current = this.positionsByUserId.get(userId);
        const fillMargin = perpMargin(qty, price, order.leverage, this.market);
        const reservedFillMargin = order.reduceOnly ? 0n : fillMargin;

        if (!current) {
            this.setPosition(this.createPosition(userId, order, side, qty, price, fillMargin));
            return;
        }

        this.removeLiquidationIndex(current);

        if (current.position === side) {
            const nextQty = current.quantity + qty;
            current.averagePrice = ((current.averagePrice * current.quantity) + (price * qty)) / nextQty;
            current.entryPrice = current.averagePrice;
            current.quantity = nextQty;
            current.margin += fillMargin;
            this.updateDerivedFields(current);
            this.addLiquidationIndex(current);
            return;
        }

        const closingQty = qty < current.quantity ? qty : current.quantity;
        const releasedMargin = current.quantity === 0n ? 0n : (current.margin * closingQty) / current.quantity;
        const pnl = this.realizedPnl(current.position, current.averagePrice, price, closingQty);

        if (qty < current.quantity) {
            this.releasePerpCollateral(userId, releasedMargin + reservedFillMargin, pnl);
            current.quantity -= qty;
            current.margin -= releasedMargin;
            this.updateDerivedFields(current);
            this.addLiquidationIndex(current);
            return;
        }

        this.deletePosition(current);

        if (qty === current.quantity) {
            this.releasePerpCollateral(userId, releasedMargin + reservedFillMargin, pnl);
            return;
        }

        const flippedQty = qty - current.quantity;
        const flippedMargin = perpMargin(flippedQty, price, order.leverage, this.market);
        const reservationToRelease = reservedFillMargin > flippedMargin ? reservedFillMargin - flippedMargin : 0n;
        this.releasePerpCollateral(userId, releasedMargin + reservationToRelease, pnl);
        this.setPosition(this.createPosition(userId, order, side, flippedQty, price, flippedMargin));
    }

    getLiquidatablePositions(indexPrice: bigint) {
        const positions: UserPositionType[] = [];

        let long = this.longLiquidationTree.ge(indexPrice);
        while (long.valid) {
            const liquidationPrice = long.key;
            if (liquidationPrice !== undefined) {
                this.appendBucketPositions(this.longLiquidationBuckets.get(liquidationPrice), positions);
            }
            long.next();
        }

        let short = this.shortLiquidationTree.le(indexPrice);
        while (short.valid) {
            const liquidationPrice = short.key;
            if (liquidationPrice !== undefined) {
                this.appendBucketPositions(this.shortLiquidationBuckets.get(liquidationPrice), positions);
            }
            short.prev();
        }

        return positions;
    }

    applyFunding(fundingRateBps: bigint, timestamp: number) {
        let insuranceUsed = 0n;
        let payments = 0;

        if (fundingRateBps === 0n) {
            return { fundingRateBps, payments, insuranceUsed };
        }

        for (const position of this.positionsById.values()) {
            const amount = this.fundingAmount(position, fundingRateBps);

            if (amount === 0n) {
                continue;
            }

            const paysFunding = fundingRateBps > 0n
                ? position.position === OrderPosition.LONG
                : position.position === OrderPosition.SHORT;

            this.removeLiquidationIndex(position);

            if (paysFunding) {
                const deducted = amount < position.margin ? amount : position.margin;
                const deficit = amount - deducted;
                position.margin -= deducted;
                this.adjustPositionCollateral(position.userId, -deducted);

                if (deficit > 0n) {
                    this.insuranceFunds.set(this.market.id, (this.insuranceFunds.get(this.market.id) ?? 0n) - deficit);
                    insuranceUsed += deficit;
                }
            } else {
                position.margin += amount;
                this.adjustPositionCollateral(position.userId, amount);
            }

            this.updateDerivedFields(position);
            this.addLiquidationIndex(position);
            this.fundingPayments.push({
                marketId: this.market.id,
                userId: position.userId,
                positionId: position.positionId,
                amount: paysFunding ? -amount : amount,
                fundingRateBps,
                timestamp,
            });
            payments++;
        }

        return { fundingRateBps, payments, insuranceUsed };
    }

    private createPosition(
        userId: UserId,
        order: PerpInMarketOrder,
        position: OrderPosition,
        quantity: bigint,
        price: bigint,
        margin: bigint
    ): UserPositionType {
        const created: UserPositionType = {
            userId,
            positionId: cuid(),
            orderId: order.orderId,
            market: order.marketId,
            side: order.side,
            position,
            leverage: 0,
            margin,
            averagePrice: price,
            quantity,
            liquidationPrice: 0n,
            bankruptcyPrice: 0n,
            entryPrice: price,
            upnl: 0n,
        };

        this.updateDerivedFields(created);
        return created;
    }

    private setPosition(position: UserPositionType) {
        this.positionsByUserId.set(position.userId, position);
        this.positionsById.set(position.positionId, position);
        this.addLiquidationIndex(position);
    }

    private deletePosition(position: UserPositionType) {
        this.positionsByUserId.delete(position.userId);
        this.positionsById.delete(position.positionId);
    }

    private updateDerivedFields(position: UserPositionType) {
        position.leverage = this.effectiveLeverage(position.quantity, position.averagePrice, position.margin);
        position.bankruptcyPrice = this.bankruptcyPrice(
            position.averagePrice,
            position.quantity,
            position.margin,
            position.position
        );
        position.liquidationPrice = this.liquidationPrice(
            position.averagePrice,
            position.quantity,
            position.margin,
            position.position
        );
    }

    private addLiquidationIndex(position: UserPositionType) {
        const buckets = position.position === OrderPosition.LONG
            ? this.longLiquidationBuckets
            : this.shortLiquidationBuckets;
        let bucket = buckets.get(position.liquidationPrice);

        if (!bucket) {
            bucket = new Set();
            buckets.set(position.liquidationPrice, bucket);

            if (position.position === OrderPosition.LONG) {
                this.longLiquidationTree = this.longLiquidationTree.insert(position.liquidationPrice, true);
            } else {
                this.shortLiquidationTree = this.shortLiquidationTree.insert(position.liquidationPrice, true);
            }
        }

        bucket.add(position.positionId);
    }

    private removeLiquidationIndex(position: UserPositionType) {
        const buckets = position.position === OrderPosition.LONG
            ? this.longLiquidationBuckets
            : this.shortLiquidationBuckets;
        const bucket = buckets.get(position.liquidationPrice);

        if (!bucket) {
            return;
        }

        bucket.delete(position.positionId);

        if (bucket.size > 0) {
            return;
        }

        buckets.delete(position.liquidationPrice);

        if (position.position === OrderPosition.LONG) {
            this.longLiquidationTree = this.longLiquidationTree.remove(position.liquidationPrice);
        } else {
            this.shortLiquidationTree = this.shortLiquidationTree.remove(position.liquidationPrice);
        }
    }

    private appendBucketPositions(bucket: Set<string> | undefined, positions: UserPositionType[]) {
        if (!bucket) {
            return;
        }

        for (const positionId of bucket) {
            const position = this.positionsById.get(positionId);
            if (position) {
                positions.push(position);
            }
        }
    }

    private fundingAmount(position: UserPositionType, fundingRateBps: bigint) {
        const absoluteRate = fundingRateBps < 0n ? -fundingRateBps : fundingRateBps;
        return (quoteNotional(position.quantity, position.averagePrice, this.market) * absoluteRate) / 10_000n;
    }

    private adjustPositionCollateral(userId: UserId, amount: bigint) {
        const balances = this.balances.get(userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.USER_NOT_FOUND, "User not found");
        }

        let balance = balances.get(this.market.quoteAsset.id);

        if (!balance) {
            balance = { total: 0n, locked: 0n };
            balances.set(this.market.quoteAsset.id, balance);
        }

        balance.total += amount;
        balance.locked += amount;
    }

    private releasePerpCollateral(userId: UserId, marginToUnlock: bigint, pnl: bigint) {
        if (marginToUnlock === 0n && pnl === 0n) {
            return;
        }

        const balances = this.balances.get(userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.USER_NOT_FOUND, "User not found");
        }

        let balance = balances.get(this.market.quoteAsset.id);

        if (!balance) {
            balance = { total: 0n, locked: 0n };
            balances.set(this.market.quoteAsset.id, balance);
        }

        if (marginToUnlock > 0n) {
            balance.locked = marginToUnlock > balance.locked ? 0n : balance.locked - marginToUnlock;
        }

        balance.total += pnl;
    }

    private realizedPnl(position: OrderPosition, entryPrice: bigint, exitPrice: bigint, qty: bigint) {
        const pnl = ((exitPrice - entryPrice) * qty) / precisionMultiplier(this.market.baseAsset.precision);
        return position === OrderPosition.LONG ? pnl : -pnl;
    }

    private effectiveLeverage(qty: bigint, price: bigint, margin: bigint) {
        if (margin === 0n) {
            return 0;
        }

        return Number(quoteNotional(qty, price, this.market)) / Number(margin);
    }

    private bankruptcyPrice(price: bigint, qty: bigint, margin: bigint, position: OrderPosition) {
        const move = qty === 0n ? 0n : ceilDiv(margin * precisionMultiplier(this.market.baseAsset.precision), qty);
        return this.applyLossMove(price, move, position);
    }

    private liquidationPrice(price: bigint, qty: bigint, margin: bigint, position: OrderPosition) {
        const bankruptcyMove = qty === 0n ? 0n : ceilDiv(margin * precisionMultiplier(this.market.baseAsset.precision), qty);
        const liquidationMove = ceilDiv(bankruptcyMove * 90n, 100n);
        return this.applyLossMove(price, liquidationMove, position);
    }

    private applyLossMove(price: bigint, move: bigint, position: OrderPosition) {
        if (position === OrderPosition.LONG) {
            return price > move ? price - move : 0n;
        }

        return price + move;
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
