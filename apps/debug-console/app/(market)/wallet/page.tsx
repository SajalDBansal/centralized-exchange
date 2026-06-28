"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell, Panel } from "@/components/ui/shell";
import { log } from "@/lib/debug-bus";
import { ResponsePanel, useResponseCapture } from "@/components/ui/response-viewer";
import Terminal from "@/components/ui/terminal";
import { formatIstTime } from "@/lib/time";

type Balance = { total: string; locked: string };
type BalancesResponse = {
    success: boolean;
    message: string;
    data: { balances: Record<string, Balance> };
};
type MutationResponse = {
    success: boolean;
    message: string;
    data?: { assetId: string; total: string; locked: string };
};
type LedgerRow = {
    id: number;
    action: "ADD" | "WITHDRAW";
    assetId: string;
    amount: string;
    result: string;
    timestamp: string;
};

export default function Wallet() {
    const [balances, setBalances] = useState<Record<string, Balance>>({});
    const [action, setAction] = useState<"ADD" | "WITHDRAW">("ADD");
    const [assetId, setAssetId] = useState("INR");
    const [amount, setAmount] = useState("1000");
    const [busy, setBusy] = useState(false);
    const [ledger, setLedger] = useState<LedgerRow[]>([]);
    const { history, capture, recordError } = useResponseCapture();

    const refresh = useCallback(async () => {
        try {
            const response = await capture<BalancesResponse>(
                "wallet.balance",
                "GET",
                "/user/get-balance",
                undefined,
                { auth: "required" },
            );
            setBalances(response.data.balances);
            const firstAsset = Object.keys(response.data.balances)[0];
            if (firstAsset) setAssetId((current) => current || firstAsset);
            log("OK", "wallet.balance", `${Object.keys(response.data.balances).length} assets loaded from engine`);
        } catch {
            // Captured in the response viewer.
        }
    }, [capture]);

    useEffect(() => {
        const timer = window.setTimeout(() => void refresh(), 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        const numericAmount = Number(amount);
        const selected = balances[assetId];
        const available = selected ? Number(selected.total) - Number(selected.locked) : 0;

        if (!assetId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
            recordError("POST", action === "ADD" ? "/user/add-balance" : "/user/withdraw-balance", { assetId, amount }, {
                success: false,
                type: "VALIDATION_ERROR",
                message: "assetId and an amount greater than zero are required",
            });
            return;
        }

        if (action === "WITHDRAW" && selected && numericAmount > available) {
            recordError("POST", "/user/withdraw-balance", { assetId, amount }, {
                success: false,
                type: "INSUFFICIENT_BALANCE",
                message: `Only ${available} ${assetId} is available; locked funds cannot be withdrawn`,
            });
            log("ERROR", "wallet.withdraw", `requested=${amount} available=${available} ${assetId}`);
            return;
        }

        setBusy(true);
        const path = action === "ADD" ? "/user/add-balance" : "/user/withdraw-balance";

        try {
            const response = await capture<MutationResponse>(
                action === "ADD" ? "wallet.onramp" : "wallet.offramp",
                "POST",
                path,
                { assetId, amount },
                { auth: "required" },
            );
            log("OK", "wallet.ledger", `${action} ${amount} ${assetId}: ${response.message}`);
            setLedger((rows) => [{
                id: Date.now(),
                action,
                assetId,
                amount,
                result: response.data?.total ?? "applied",
                timestamp: formatIstTime(),
            }, ...rows].slice(0, 20));
            await refresh();
        } catch {
            // Captured in the response viewer.
        } finally {
            setBusy(false);
        }
    }

    const rows = useMemo(
        () => Object.entries(balances).sort(([a], [b]) => a.localeCompare(b)),
        [balances],
    );
    const availableAssets = rows.filter(([, balance]) => Number(balance.total) > Number(balance.locked)).length;
    const lockedAssets = rows.filter(([, balance]) => Number(balance.locked) > 0).length;

    return (
        <Shell title="wallet">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1.4fr_1fr_1fr]">
                <div className="flex min-h-0 flex-col gap-px bg-border">
                    <Panel
                        title="wallet.balance · engine source of truth"
                        right={<button onClick={() => void refresh()} className="border border-border bg-card px-2 text-[11px] hover:text-term-green">[refresh]</button>}
                    >
                        <div className="grid grid-cols-3 divide-x divide-border text-[12px]">
                            <Stat label="asset_count" value={String(rows.length)} accent="term-green" />
                            <Stat label="available_assets" value={String(availableAssets)} accent="foreground" />
                            <Stat label="locked_assets" value={String(lockedAssets)} accent="term-yellow" />
                        </div>
                    </Panel>

                    <Panel title="wallet.mutate · real on-ramp / off-ramp">
                        <form onSubmit={submit} className="grid grid-cols-1 gap-2 p-3 text-[12px] md:grid-cols-2">
                            <div className="flex gap-1 md:col-span-2">
                                {(["ADD", "WITHDRAW"] as const).map((candidate) => (
                                    <button
                                        key={candidate}
                                        type="button"
                                        onClick={() => setAction(candidate)}
                                        className={`flex-1 border px-2 py-1 ${action === candidate
                                            ? candidate === "ADD" ? "border-term-green text-term-green" : "border-term-yellow text-term-yellow"
                                            : "border-border text-term-dim"}`}
                                    >
                                        {candidate}
                                    </button>
                                ))}
                            </div>
                            <label>
                                <div className="text-term-dim">asset_id</div>
                                <input list="wallet-assets" value={assetId} onChange={(e) => setAssetId(e.target.value.toUpperCase())} className={inputCls} />
                                <datalist id="wallet-assets">{rows.map(([symbol]) => <option key={symbol} value={symbol} />)}</datalist>
                            </label>
                            <label>
                                <div className="text-term-dim">amount</div>
                                <input value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
                            </label>
                            <div className="flex items-center justify-between gap-2 md:col-span-2">
                                <span className="text-term-dim">
                                    POST /api/v1/user/{action === "ADD" ? "add-balance" : "withdraw-balance"}
                                </span>
                                <button disabled={busy} className={`border px-3 py-1 disabled:opacity-50 ${action === "ADD" ? "border-term-green text-term-green" : "border-term-yellow text-term-yellow"}`}>
                                    {busy ? "applying..." : `$ ./${action.toLowerCase()} --asset=${assetId}`}
                                </button>
                            </div>
                        </form>
                    </Panel>

                    <Panel title="wallet.assets · total / locked / available">
                        <table className="w-full text-[12px]">
                            <thead className="border-b border-border bg-secondary text-left text-[11px] uppercase text-muted-foreground">
                                <tr><th className="px-3 py-1">asset</th><th className="px-3 py-1 text-right">total</th><th className="px-3 py-1 text-right">locked</th><th className="px-3 py-1 text-right">available</th></tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr><td colSpan={4} className="px-3 py-3 text-term-dim">{"// no balance data — sign in, then refresh"}</td></tr>
                                ) : rows.map(([symbol, balance]) => {
                                    const available = Number(balance.total) - Number(balance.locked);
                                    return (
                                        <tr key={symbol} className="border-b border-border hover:bg-accent/40">
                                            <td className="px-3 py-1 text-term-cyan">{symbol}</td>
                                            <td className="px-3 py-1 text-right">{balance.total}</td>
                                            <td className="px-3 py-1 text-right text-term-yellow">{balance.locked}</td>
                                            <td className="px-3 py-1 text-right text-term-green">{available}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </Panel>

                    <Panel title="wallet.session_ledger">
                        <table className="w-full text-[12px]">
                            <tbody>{ledger.length === 0 ? (
                                <tr><td className="px-3 py-2 text-term-dim">{"// balance mutations from this browser session appear here"}</td></tr>
                            ) : ledger.map((row) => (
                                <tr key={row.id} className="border-b border-border">
                                    <td className={row.action === "ADD" ? "px-3 py-1 text-term-green" : "px-3 py-1 text-term-yellow"}>{row.action}</td>
                                    <td className="px-3 py-1">{row.assetId}</td>
                                    <td className="px-3 py-1 text-right">{row.amount}</td>
                                    <td className="px-3 py-1 text-right text-term-dim">total={row.result}</td>
                                    <td className="px-3 py-1 text-right text-term-dim">{row.timestamp}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </Panel>
                </div>
                <ResponsePanel data={history} title={`wallet.request_history · ${history.length} calls`} />
                <Terminal title="stdout · wallet.service" />
            </main>
        </Shell>
    );
}

const inputCls = "w-full border border-border bg-input px-2 py-1 font-mono text-foreground outline-none focus:border-term-green";

function Stat({ label, value, accent }: { label: string; value: string; accent: "term-green" | "term-yellow" | "foreground" }) {
    const cls = accent === "term-green" ? "text-term-green" : accent === "term-yellow" ? "text-term-yellow" : "text-foreground";
    return <div className="p-3"><div className="text-[11px] uppercase text-muted-foreground">{label}</div><div className={`text-xl ${cls}`}>{value}</div></div>;
}
