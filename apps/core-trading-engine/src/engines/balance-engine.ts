import { AssetOrderbookType, BalancesType, BaseReturnPayload, CreateOrderPayload, EVENT_REJECT_CODES, FillType, GetUserBalancesPayload, InMarketOrderType, Market, MarketId, normalizeIncomingOrderType, NormalizeOnRampType, OrderId, ReturnBalanceType, UserId, UserPosition } from "@workspace/types";
import { RejectError } from "../utils/error";

type ReadonlyEngineState = {
    readonly markets: ReadonlyMap<MarketId, Market>;

    readonly orderbooks: ReadonlyMap<MarketId, AssetOrderbookType>;

    readonly positions: ReadonlyMap<MarketId, UserPosition>;

    readonly orderMap: ReadonlyMap<OrderId, MarketId>;
};

type BalancesEngineDeps = ReadonlyEngineState & {
    balances: BalancesType;
};

export class BalanceEngine {

    constructor(private readonly state: BalancesEngineDeps) { }

    private getAllAssets(): Set<string> {
        const assets = new Set<string>();

        for (const market of this.state.markets.values()) {
            assets.add(market.baseAsset);
            assets.add(market.quoteAsset);
        }

        return assets;
    }

    addUser(userId: UserId) {
        if (this.state.balances.has(userId)) {
            this.reject(EVENT_REJECT_CODES.USER_ALREADY_EXISTS, "User already exists")
        }

        this.state.balances.set(userId, new Map());
        const balances = this.state.balances.get(userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Failed to initialize user balances")
        }

        for (const asset of this.getAllAssets()) {
            balances.set(asset, {
                total: 0n,
                locked: 0n
            })
        }

        return {
            success: true,
            message: "User added successfully"
        };

    }

    getUserBalances(payload: GetUserBalancesPayload): ReturnBalanceType {
        const balances = this.state.balances.get(payload.userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.NO_BALANCES, "No Balances found for the user")
        }

        const userbalance = Object.fromEntries(
            Array.from(balances.entries()).map(([asset, balance]) => [
                asset,
                {
                    total: (balance.total).toString(),
                    locked: (balance.locked).toString()
                }
            ])
        )

        return userbalance;
    }

    addBalance(payload: NormalizeOnRampType) {
        const { userId, asset, amount } = payload;
        let balances = this.state.balances.get(userId);
        if (!balances) {
            this.reject(EVENT_REJECT_CODES.USER_NOT_FOUND, "User not found");
        }
        const existing = balances.get(asset);

        const newTotal = (existing?.total ?? 0n) + BigInt(amount)
        const newlocked = (existing?.locked ?? 0n);

        balances.set(asset, {
            total: newTotal,
            locked: newlocked
        })

        return {
            asset,
            total: (newTotal).toString(),
            locked: (newlocked).toString()
        }
    }

    lockBalance(order: normalizeIncomingOrderType) { }

    applyFill(fill: FillType) { }

    releaseUnusedBalance(order: InMarketOrderType) { }

    releaseOrderMargin(order: InMarketOrderType) { }

    updateTakerBalance(order: CreateOrderPayload) { }

    updateMakerBalance(order: CreateOrderPayload) { }

    releaseBalance(order: InMarketOrderType) { }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
