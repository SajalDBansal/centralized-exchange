import { CreateOrderPayload, EVENT_REJECT_CODES, GetUserBalancesPayload, GetUserBalancesReturnPayload, OnRampPayload, OnRampReturnPayload, ReturnBalanceType } from "@workspace/types";
import { RejectError } from "../utils/error";
import { BALANCES } from "./core-engine";

export class BalanceEngine {

    getUserBalances(payload: GetUserBalancesPayload): ReturnBalanceType {
        const balances = BALANCES.get(payload.userId);

        if (!balances) {
            this.reject(EVENT_REJECT_CODES.NO_BALANCES, "No Balances found for the user")
        }

        const userbalance = Object.fromEntries(
            Array.from(balances.entries()).map(([asset, balance]) => [
                asset,
                {
                    total: balance.total,
                    locked: balance.locked
                }
            ])
        )

        return userbalance;
    }

    addBalance(payload: OnRampPayload) {
        const { userId, asset, amount } = payload;
        let balances = BALANCES.get(userId);
        if (!balances) {
            balances = new Map();
            BALANCES.set(userId, balances);
        }
        const existing = balances.get(asset);

        const newTotal = (existing?.total ?? 0n) + amount
        const newlocked = (existing?.locked ?? 0n);

        balances.set(asset, {
            total: newTotal,
            locked: newlocked
        })

        return {
            asset,
            total: newTotal,
            locked: newlocked
        }
    }

    lockBalance(order: CreateOrderPayload) { }

    updateTakerBalance(order: CreateOrderPayload) { }

    updateMakerBalance(order: CreateOrderPayload) { }

    releaseBalance(order: CreateOrderPayload) { }

    private reject(code: EVENT_REJECT_CODES, message: string): never {
        throw new RejectError(code, message);
    }
}
