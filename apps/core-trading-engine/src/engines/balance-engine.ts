import { CancelOrderPayload, CreateOrderPayload, EVENT_REJECT_CODES, FillType, GetUserBalancesPayload, GetUserBalancesReturnPayload, InMarketOrderType, OnRampPayload, OnRampReturnPayload, ReturnBalanceType } from "@workspace/types";
import { RejectError } from "../utils/error";
import { EngineState } from "./core-engine";

export class BalanceEngine {

    constructor(private readonly state: EngineState) { }

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

    addBalance(payload: OnRampPayload) {
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

    lockBalance(order: CreateOrderPayload) { }

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
