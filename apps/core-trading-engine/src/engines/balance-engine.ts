import { BalancesType, BaseReturnPayload, CreateOrderPayload, EVENT_REJECT_CODES, FillType, GetUserBalancesPayload, InMarketOrderType, MarketsType, normalizeIncomingOrderType, NormalizeOnRampType, ReturnBalanceType, UserId } from "@workspace/types";
import { RejectError } from "../utils/error";
import { EngineState } from "./core-engine";
import { baseAsset, quoteAsset } from "./market-engine";

type BalancesEngineDeps = {
    balances: BalancesType;
    markets: Readonly<MarketsType>;
};

export class BalanceEngine {

    constructor(private readonly state: BalancesEngineDeps) { }

    addUser(userId: UserId) {
        if (this.state.balances.has(userId)) {
            this.reject(EVENT_REJECT_CODES.USER_ALREADY_EXISTS, "User already exists")
        }

        this.state.balances.set(userId, new Map());
        const balances = this.state.balances.get(userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.INTERNAL_ERROR, "Failed to initialize user balances")
        }

        for (const base of baseAsset) {
            balances.set(base, {
                total: 0n,
                locked: 0n
            })
        }

        for (const quote of quoteAsset) {
            balances.set(quote, {
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
            balances = new Map();
            this.state.balances.set(userId, balances);
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
