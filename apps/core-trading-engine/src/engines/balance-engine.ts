import {
    Asset,
    BalancesType,
    BaseBalanceType,
    EVENT_REJECT_CODES,
    GetUserBalancesPayload,
    InMarketFillType,
    InMarketOrderType,
    Market,
    MarketId,
    MarketType,
    normalizeIncomingOrderType,
    NormalizeOnRampType,
    OrderId,
    OrderSide,
    OrderStatus,
    ReturnBalanceType,
    UserId,
    UserPosition,
} from "@workspace/types";
import { RejectError } from "../utils/error";
import { SingleMarketOrderBook } from "./single-orderbook";
import { formatBigInt, perpMargin, quoteNotional } from "../utils/parse-incoming";

type ReadonlyEngineState = {
    readonly markets: ReadonlyMap<MarketId, Market>;
    readonly orderbooks: ReadonlyMap<MarketId, SingleMarketOrderBook>;
    readonly positions: ReadonlyMap<MarketId, UserPosition>;
    readonly orderMap: ReadonlyMap<OrderId, MarketId>;
    readonly orders: ReadonlyMap<OrderId, InMarketOrderType>;
    readonly assets: ReadonlyMap<string, Asset>;
};

type BalancesEngineDeps = ReadonlyEngineState & {
    balances: BalancesType;
};

type BalanceEntry = { total: bigint; locked: bigint; };

export class BalanceEngine {
    constructor(private readonly state: BalancesEngineDeps) { }

    addUser(userId: UserId) {
        if (this.state.balances.has(userId)) {
            this.reject(EVENT_REJECT_CODES.USER_ALREADY_EXISTS, "User already exists");
        }

        const balances: BaseBalanceType = new Map();

        for (const asset of this.getAllAssets()) {
            balances.set(asset, { total: 0n, locked: 0n });
        }

        this.state.balances.set(userId, balances);

        return { success: true, message: "User added successfully" };
    }

    getUserBalances(payload: GetUserBalancesPayload): ReturnBalanceType {
        const balances = this.state.balances.get(payload.userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.NO_BALANCES, "No balances found for the user");
        }

        return Object.fromEntries(
            Array.from(balances.entries()).map(([asset, balance]) => {
                const precision = this.getAsset(asset).precision;
                return [
                    asset,
                    {
                        total: formatBigInt(balance.total, precision),
                        locked: formatBigInt(balance.locked, precision),
                    },
                ]
            })
        );
    }

    addBalance(payload: NormalizeOnRampType) {
        const { userId, assetId, amount } = payload;
        const balances = this.state.balances.get(userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.USER_NOT_FOUND, "User not found");
        }

        const existing = this.getOrCreateBalance(balances, assetId);
        existing.total += amount;

        const precision = this.getAsset(assetId).precision;

        return {
            assetId,
            total: formatBigInt(existing.total, precision),
            locked: formatBigInt(existing.locked, precision),
        };
    }

    lockBalance(order: normalizeIncomingOrderType) {
        const market = this.getMarket(order.marketId);
        const balances = this.getUserBalanceMap(order.userId);

        if (order.marketType === MarketType.PERP) {
            this.lock(balances, market.quoteAsset, this.requiredPerpMargin(order, market));
            return;
        }

        if (order.side === OrderSide.BUY) {
            this.lock(balances, market.quoteAsset, quoteNotional(order.quantity, order.entryPrice, market));
            return;
        }

        this.lock(balances, market.baseAsset, order.quantity);
    }

    applyFill(fill: InMarketFillType) {
        const market = this.getMarket(fill.marketId);
        const makerOrder = this.state.orders.get(fill.makerOrderId);
        const takerOrder = this.state.orders.get(fill.takerOrderId);

        if (!makerOrder || !takerOrder) {
            this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Fill order missing");
        }

        this.applySpotFillToUser(makerOrder, fill.makerUserId, fill.qty, fill.price, market);
        this.applySpotFillToUser(takerOrder, fill.takerUserId, fill.qty, fill.price, market);
    }

    releaseUnusedBalance(order: InMarketOrderType) {
        const market = this.getMarket(order.marketId);
        const balances = this.getUserBalanceMap(order.userId);

        if (order.marketType === MarketType.PERP) {
            const desired = this.shouldKeepRestingLock(order)
                ? this.requiredPerpMargin(order, market, order.remainingQty)
                : 0n;
            const spent = this.filledMargin(order, market);
            const release = this.requiredPerpMargin(order, market) - spent - desired;
            this.unlock(balances, market.quoteAsset, release);
            return;
        }

        if (order.side === OrderSide.BUY) {
            const desired = this.shouldKeepRestingLock(order) ? quoteNotional(order.remainingQty, order.entryPrice, market) : 0n;
            const spent = this.filledCost(order, market);
            const release = quoteNotional(order.quantity, order.entryPrice, market) - spent - desired;
            this.unlock(balances, market.quoteAsset, release);
            return;
        }

        const desired = this.shouldKeepRestingLock(order) ? order.remainingQty : 0n;
        this.unlock(balances, market.baseAsset, order.quantity - order.filled - desired);
    }

    releaseOrderMargin(order: InMarketOrderType) {
        const market = this.getMarket(order.marketId);
        const balances = this.getUserBalanceMap(order.userId);

        if (order.marketType === MarketType.PERP) {
            this.unlock(balances, market.quoteAsset, this.requiredPerpMargin(order, market, order.remainingQty));
            return;
        }

        if (order.side === OrderSide.BUY) {
            this.unlock(balances, market.quoteAsset, quoteNotional(order.remainingQty, order.entryPrice, market));
            return;
        }

        this.unlock(balances, market.baseAsset, order.remainingQty);
    }

    releaseBalance(order: normalizeIncomingOrderType) {
        const market = this.getMarket(order.marketId);
        const balances = this.getUserBalanceMap(order.userId);

        if (order.marketType === MarketType.PERP) {
            this.unlock(balances, market.quoteAsset, this.requiredPerpMargin(order, market));
            return;
        }

        if (order.side === OrderSide.BUY) {
            this.unlock(balances, market.quoteAsset, quoteNotional(order.quantity, order.entryPrice, market));
            return;
        }

        this.unlock(balances, market.baseAsset, order.quantity);
    }

    private applySpotFillToUser(order: InMarketOrderType, userId: string, qty: bigint, price: bigint, market: Market) {
        if (order.marketType === MarketType.PERP) {
            return;
        }

        const balances = this.getUserBalanceMap(userId);
        const quote = this.getOrCreateBalance(balances, market.quoteAsset.id);
        const base = this.getOrCreateBalance(balances, market.baseAsset.id);
        const quoteAmount = quoteNotional(qty, price, market);

        if (order.side === OrderSide.BUY) {
            this.debitLocked(quote, quoteAmount);
            base.total += qty;
            return;
        }

        this.debitLocked(base, qty);
        quote.total += quoteAmount;
    }

    private getAllAssets(): Set<string> {
        const assets = new Set<string>();

        for (const market of this.state.markets.values()) {
            assets.add(market.baseAsset.id);
            assets.add(market.quoteAsset.id);
        }

        return assets;
    }

    private getMarket(marketId: MarketId): Market {
        const market = this.state.markets.get(marketId);

        if (!market) {
            this.reject(EVENT_REJECT_CODES.INVALID_MARKET, "Market not found");
        }

        return market;
    }

    private getUserBalanceMap(userId: UserId): BaseBalanceType {
        const balances = this.state.balances.get(userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.USER_NOT_FOUND, "User not found");
        }

        return balances;
    }

    private getOrCreateBalance(balances: BaseBalanceType, asset: string): BalanceEntry {
        let balance = balances.get(asset);

        if (!balance) {
            balance = { total: 0n, locked: 0n };
            balances.set(asset, balance);
        }

        return balance;
    }

    private lock(balances: BaseBalanceType, asset: Asset, amount: bigint) {
        if (amount <= 0n) {
            return;
        }

        const balance = this.getOrCreateBalance(balances, asset.id);

        if (balance.total - balance.locked < amount) {
            this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "Insufficient available balance");
        }

        balance.locked += amount;
    }

    private unlock(balances: BaseBalanceType, asset: Asset, amount: bigint) {
        if (amount <= 0n) {
            return;
        }

        const balance = this.getOrCreateBalance(balances, asset.id);
        balance.locked = amount > balance.locked ? 0n : balance.locked - amount;
    }

    private debitLocked(balance: BalanceEntry, amount: bigint) {
        if (amount <= 0n) {
            return;
        }

        if (balance.locked < amount || balance.total < amount) {
            this.reject(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE, "Locked balance underflow");
        }

        balance.locked -= amount;
        balance.total -= amount;
    }

    private shouldKeepRestingLock(order: InMarketOrderType) {
        return order.status === OrderStatus.OPEN || order.status === OrderStatus.PARTIAL;
    }

    private filledCost(order: InMarketOrderType, market: Market) {
        return order.fills.reduce((sum, fill) => {
            const isBuyer = order.side === OrderSide.BUY;
            const isOrder = fill.makerOrderId === order.orderId || fill.takerOrderId === order.orderId;
            return isBuyer && isOrder ? sum + quoteNotional(fill.qty, fill.price, market) : sum;
        }, 0n);
    }

    private filledMargin(order: InMarketOrderType, market: Market) {
        if (order.marketType !== MarketType.PERP || order.filled === 0n) {
            return 0n;
        }

        return order.fills.reduce((sum, fill) => {
            const isOrder = fill.makerOrderId === order.orderId || fill.takerOrderId === order.orderId;
            return isOrder ? sum + perpMargin(fill.qty, fill.price, order.leverage, market) : sum;
        }, 0n);
    }

    private requiredPerpMargin(order: normalizeIncomingOrderType | InMarketOrderType, market: Market, qty = order.quantity) {
        if (order.marketType !== MarketType.PERP) {
            return 0n;
        }

        return perpMargin(qty, order.entryPrice, order.leverage, market);
    }

    private getAsset(assetId: string): Asset {
        const asset = this.state.assets.get(assetId);

        if (!asset) {
            this.reject(EVENT_REJECT_CODES.INVALID_ASSET, "Asset not found");
        }

        return asset;
    }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
