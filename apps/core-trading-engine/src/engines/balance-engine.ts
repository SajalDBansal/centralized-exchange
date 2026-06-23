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
    OrderType,
    ReturnBalanceType,
    TimeInForce,
    UserId,
} from "@workspace/types";
import { RejectError } from "../utils/error";
import type { SingleMarketOrderBook } from "./single-orderbook";
import { bufferedPerpMargin, formatBigInt, parseBigInt, perpMargin, quoteNotional } from "../utils/parse-incoming";

type ReadonlyEngineState = {
    readonly markets: ReadonlyMap<MarketId, Market>;
    readonly orderbooks: ReadonlyMap<MarketId, SingleMarketOrderBook>;
    readonly orderMap: ReadonlyMap<OrderId, MarketId>;
    readonly orders: ReadonlyMap<OrderId, InMarketOrderType>;
    readonly assets: ReadonlyMap<string, Asset>;
    readonly insuranceFunds: Map<MarketId, bigint>;
    readonly commissionFunds: Map<MarketId, bigint>;
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
            const amount = order.reduceOnly
                ? 0n
                : order.type === OrderType.MARKET
                    ? bufferedPerpMargin(order.quantity, order.entryPrice, order.leverage, market)
                    : this.requiredPerpMargin(order, market);
            this.lock(balances, market.quoteAsset, amount, EVENT_REJECT_CODES.INSUFFICIENT_MARGIN);
            return amount;
        }

        if (order.side === OrderSide.BUY) {
            const notional = quoteNotional(order.quantity, order.entryPrice, market);
            const amount = notional + this.fillFee(notional, false);
            this.lock(balances, market.quoteAsset, amount);
            return amount;
        }

        this.lock(balances, market.baseAsset, order.quantity);
        return order.quantity;
    }

    applyFill(fill: InMarketFillType, makerOrder: InMarketOrderType, takerOrder: InMarketOrderType) {
        const market = this.getMarket(fill.marketId);

        this.applySpotFillToUser(makerOrder, fill.makerUserId, fill.qty, fill.price, market, true);
        this.applySpotFillToUser(takerOrder, fill.takerUserId, fill.qty, fill.price, market, false);
    }

    applyPerpFillFees(fill: InMarketFillType, makerOrder: InMarketOrderType, takerOrder: InMarketOrderType) {
        const market = this.getMarket(fill.marketId);
        const notional = quoteNotional(fill.qty, fill.price, market);
        this.chargeAvailableQuoteFee(
            makerOrder.userId,
            market,
            this.fillFee(notional, true, makerOrder.marketType === MarketType.PERP && makerOrder.liquidation)
        );
        this.chargeAvailableQuoteFee(
            takerOrder.userId,
            market,
            this.fillFee(notional, false, takerOrder.marketType === MarketType.PERP && takerOrder.liquidation)
        );
    }

    releaseUnusedBalance(order: InMarketOrderType) {
        const market = this.getMarket(order.marketId);
        const balances = this.getUserBalanceMap(order.userId);

        if (order.marketType === MarketType.PERP) {
            if (!this.shouldKeepRestingLock(order)) {
                this.releasePerpOrderReservation(order, balances, market);
            }
            return;
        }

        if (order.side === OrderSide.BUY) {
            this.releaseSpotOrderReservation(order, balances, market);
            return;
        }

        this.releaseSpotOrderReservation(order, balances, market);
    }

    releaseOrderMargin(order: InMarketOrderType) {
        const market = this.getMarket(order.marketId);
        const balances = this.getUserBalanceMap(order.userId);

        if (order.marketType === MarketType.PERP) {
            this.releasePerpOrderReservation(order, balances, market);
            return;
        }

        this.releaseSpotOrderReservation(order, balances, market, false);
    }

    releaseBalance(order: normalizeIncomingOrderType, initiallyLocked: bigint) {
        const market = this.getMarket(order.marketId);
        const balances = this.getUserBalanceMap(order.userId);

        if (order.marketType === MarketType.PERP) {
            this.unlock(balances, market.quoteAsset, initiallyLocked);
            return;
        }

        if (order.side === OrderSide.BUY) {
            this.unlock(balances, market.quoteAsset, initiallyLocked);
            return;
        }

        this.unlock(balances, market.baseAsset, order.quantity);
    }

    prepareFill(maker: InMarketOrderType, taker: InMarketOrderType, requestedQty: bigint, price: bigint) {
        if (maker.marketType === MarketType.SPOT && taker.marketType === MarketType.SPOT) {
            return this.prepareSpotFill(maker, taker, requestedQty, price);
        }

        if (maker.marketType !== MarketType.PERP || taker.marketType !== MarketType.PERP) {
            return { qty: requestedQty, reservationRejected: false };
        }

        const market = this.getMarket(taker.marketId);
        const makerQty = this.maxPerpFillQty(maker, requestedQty, price, market);
        const takerQty = this.maxPerpFillQty(taker, requestedQty, price, market);
        const qty = makerQty < takerQty ? makerQty : takerQty;

        if (qty > 0n) {
            this.allotPerpFillMargin(maker, qty, price, market);
            this.allotPerpFillMargin(taker, qty, price, market);
        }

        return { qty, reservationRejected: qty < requestedQty };
    }

    private applySpotFillToUser(
        order: InMarketOrderType,
        userId: string,
        qty: bigint,
        price: bigint,
        market: Market,
        maker: boolean
    ) {
        if (order.marketType === MarketType.PERP) {
            return;
        }

        const balances = this.getUserBalanceMap(userId);
        const quote = this.getOrCreateBalance(balances, market.quoteAsset.id);
        const base = this.getOrCreateBalance(balances, market.baseAsset.id);
        const quoteAmount = quoteNotional(qty, price, market);
        const fee = this.fillFee(quoteAmount, maker, false);

        if (order.side === OrderSide.BUY) {
            this.debitLocked(quote, quoteAmount + fee);
            base.total += qty;
            this.addCommission(market.id, fee);
            return;
        }

        this.debitLocked(base, qty);
        quote.total += quoteAmount - fee;
        this.addCommission(market.id, fee);
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

    private lock(
        balances: BaseBalanceType,
        asset: Asset,
        amount: bigint,
        code = EVENT_REJECT_CODES.INSUFFICIENT_BALANCE
    ) {
        if (amount <= 0n) {
            return;
        }

        const balance = this.getOrCreateBalance(balances, asset.id);

        if (balance.total - balance.locked < amount) {
            this.reject(code, "Insufficient available balance");
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
        return order.type === OrderType.LIMIT
            && order.timeInForce === TimeInForce.GTC
            && (order.status === OrderStatus.OPEN || order.status === OrderStatus.PARTIAL_FILLED);
    }

    private requiredPerpMargin(order: normalizeIncomingOrderType | InMarketOrderType, market: Market, qty = order.quantity) {
        if (order.marketType !== MarketType.PERP) {
            return 0n;
        }

        return perpMargin(qty, order.entryPrice, order.leverage, market);
    }

    private prepareSpotFill(
        maker: Extract<InMarketOrderType, { marketType: MarketType.SPOT; }>,
        taker: Extract<InMarketOrderType, { marketType: MarketType.SPOT; }>,
        requestedQty: bigint,
        price: bigint
    ) {
        const market = this.getMarket(taker.marketId);
        const makerQty = this.maxSpotFillQty(maker, requestedQty, price, market, true);
        const takerQty = this.maxSpotFillQty(taker, requestedQty, price, market, false);
        const qty = makerQty < takerQty ? makerQty : takerQty;

        if (qty > 0n) {
            this.allotSpotFillBalance(maker, qty, price, market, true);
            this.allotSpotFillBalance(taker, qty, price, market, false);
        }

        return { qty, reservationRejected: qty < requestedQty };
    }

    private maxSpotFillQty(
        order: Extract<InMarketOrderType, { marketType: MarketType.SPOT; }>,
        requestedQty: bigint,
        price: bigint,
        market: Market,
        maker: boolean
    ) {
        const availableReservation = this.availableSpotOrderReservation(order);

        if (order.side === OrderSide.SELL) {
            return availableReservation < requestedQty ? availableReservation : requestedQty;
        }

        const balances = this.getUserBalanceMap(order.userId);
        const quote = this.getOrCreateBalance(balances, market.quoteAsset.id);
        const availableWalletBalance = order.type === OrderType.MARKET
            ? quote.total - quote.locked
            : 0n;
        const capacity = availableReservation + availableWalletBalance;

        if (this.requiredSpotBuyBalance(order, requestedQty, price, market, maker) <= capacity) {
            return requestedQty;
        }

        let low = 0n;
        let high = requestedQty;

        while (low < high) {
            const mid = (low + high + 1n) / 2n;

            if (this.requiredSpotBuyBalance(order, mid, price, market, maker) <= capacity) {
                low = mid;
            } else {
                high = mid - 1n;
            }
        }

        return this.floorToLotSize(low, market);
    }

    private allotSpotFillBalance(
        order: Extract<InMarketOrderType, { marketType: MarketType.SPOT; }>,
        qty: bigint,
        price: bigint,
        market: Market,
        maker: boolean
    ) {
        const required = order.side === OrderSide.BUY
            ? this.requiredSpotBuyBalance(order, qty, price, market, maker)
            : qty;
        const availableReservation = this.availableSpotOrderReservation(order);
        const additional = required > availableReservation ? required - availableReservation : 0n;

        if (additional > 0n) {
            const balances = this.getUserBalanceMap(order.userId);
            this.lock(balances, market.quoteAsset, additional);
            order.balanceLedger.allotted += additional;
        }

        order.balanceLedger.used += required;
    }

    private availableSpotOrderReservation(order: Extract<InMarketOrderType, { marketType: MarketType.SPOT; }>) {
        return order.balanceLedger.allotted - order.balanceLedger.used - order.balanceLedger.released;
    }

    private releaseSpotOrderReservation(
        order: Extract<InMarketOrderType, { marketType: MarketType.SPOT; }>,
        balances: BaseBalanceType,
        market: Market,
        keepRestingLock = this.shouldKeepRestingLock(order)
    ) {
        const desired = keepRestingLock
            ? order.side === OrderSide.BUY
                ? this.requiredSpotBuyBalance(order, order.remainingQty, order.entryPrice, market, true)
                : order.remainingQty
            : 0n;
        const available = this.availableSpotOrderReservation(order);
        const release = available > desired ? available - desired : 0n;
        this.unlock(balances, order.side === OrderSide.BUY ? market.quoteAsset : market.baseAsset, release);
        order.balanceLedger.released += release;
    }

    private maxPerpFillQty(
        order: Extract<InMarketOrderType, { marketType: MarketType.PERP; }>,
        requestedQty: bigint,
        price: bigint,
        market: Market
    ) {
        if (order.reduceOnly) {
            return requestedQty;
        }

        const balances = this.getUserBalanceMap(order.userId);
        const collateral = this.getOrCreateBalance(balances, market.quoteAsset.id);
        const availableReservation = this.availablePerpOrderReservation(order);
        const availableCollateral = collateral.total - collateral.locked;
        const capacity = availableReservation + availableCollateral;

        if (perpMargin(requestedQty, price, order.leverage, market) <= capacity) {
            return requestedQty;
        }

        let low = 0n;
        let high = requestedQty;

        while (low < high) {
            const mid = (low + high + 1n) / 2n;

            if (perpMargin(mid, price, order.leverage, market) <= capacity) {
                low = mid;
            } else {
                high = mid - 1n;
            }
        }

        return this.floorToLotSize(low, market);
    }

    private floorToLotSize(qty: bigint, market: Market) {
        const lotSize = parseBigInt(
            market.lotSize.toString(),
            market.baseAsset.precision,
            EVENT_REJECT_CODES.INVALID_LOT_SIZE,
            "lot size"
        );

        return lotSize > 0n ? qty - (qty % lotSize) : 0n;
    }

    private allotPerpFillMargin(
        order: Extract<InMarketOrderType, { marketType: MarketType.PERP; }>,
        qty: bigint,
        price: bigint,
        market: Market
    ) {
        if (order.reduceOnly) {
            return;
        }

        const required = perpMargin(qty, price, order.leverage, market);
        const availableReservation = this.availablePerpOrderReservation(order);
        const additional = required > availableReservation ? required - availableReservation : 0n;

        if (additional > 0n) {
            const balances = this.getUserBalanceMap(order.userId);
            this.lock(balances, market.quoteAsset, additional, EVENT_REJECT_CODES.INSUFFICIENT_MARGIN);
            order.marginLedger.allotted += additional;
            order.margin = order.marginLedger.allotted;
        }

        order.marginLedger.used += required;
    }

    private availablePerpOrderReservation(order: Extract<InMarketOrderType, { marketType: MarketType.PERP; }>) {
        return order.marginLedger.allotted - order.marginLedger.used - order.marginLedger.released;
    }

    private releasePerpOrderReservation(
        order: Extract<InMarketOrderType, { marketType: MarketType.PERP; }>,
        balances: BaseBalanceType,
        market: Market
    ) {
        const release = this.availablePerpOrderReservation(order);
        this.unlock(balances, market.quoteAsset, release);
        order.marginLedger.released += release;
    }

    private requiredSpotBuyBalance(
        order: Extract<InMarketOrderType, { marketType: MarketType.SPOT; }>,
        qty: bigint,
        price: bigint,
        market: Market,
        maker: boolean
    ) {
        const notional = quoteNotional(qty, price, market);
        return notional + this.fillFee(notional, maker, false);
    }

    private fillFee(notional: bigint, maker: boolean, liquidation = false) {
        const basisPoints = liquidation ? 50n : maker ? 1n : 2n;
        return notional === 0n ? 0n : (notional * basisPoints + 9_999n) / 10_000n;
    }

    private chargeAvailableQuoteFee(userId: string, market: Market, fee: bigint) {
        if (fee <= 0n) {
            return;
        }

        const balances = this.getUserBalanceMap(userId);
        const quote = this.getOrCreateBalance(balances, market.quoteAsset.id);
        const available = quote.total - quote.locked;
        const charged = available < fee ? available : fee;
        const deficit = fee - charged;
        quote.total -= charged;

        if (deficit > 0n) {
            this.state.insuranceFunds.set(market.id, (this.state.insuranceFunds.get(market.id) ?? 0n) - deficit);
        }

        this.addCommission(market.id, fee);
    }

    private addCommission(marketId: MarketId, fee: bigint) {
        this.state.commissionFunds.set(marketId, (this.state.commissionFunds.get(marketId) ?? 0n) + fee);
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
