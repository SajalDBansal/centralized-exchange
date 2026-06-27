"use client";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Search } from "lucide-react";
import { toast } from "sonner";
import { BALANCES, WALLET_TX, POSITIONS } from "@/lib/mock-data";
import { fmtAmount, fmtPct, fmtUsd } from "@/lib/format";
import { useMemo, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import Image from "next/image";

type Tab = "overview" | "spot" | "futures" | "funding" | "history";
type Modal = null | { kind: "Deposit" | "Withdraw" | "Transfer"; asset: string };

export default function WalletPage() {
    const [tab, setTab] = useState<Tab>("overview");
    const [search, setSearch] = useState("");
    const [modal, setModal] = useState<Modal>(null);

    const totals = useMemo(() => {
        const equity = BALANCES.reduce((s, b) => s + b.total * b.usdPrice, 0);
        const available = BALANCES.reduce((s, b) => s + b.available * b.usdPrice, 0);
        const marginUsed = POSITIONS.filter((p) => p.status === "open").reduce((s, p) => s + p.margin, 0);
        const upnl = POSITIONS.filter((p) => p.status === "open").reduce((s, p) => s + p.pnl, 0);
        return { equity, available, marginUsed, upnl };
    }, []);

    const balances = useMemo(
        () => BALANCES.filter((b) => b.asset.toLowerCase().includes(search.toLowerCase())),
        [search]
    );

    return (
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
            {/* Portfolio summary */}
            <div className="rounded-xl border border-border bg-card p-6">
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    <div>
                        <div className="text-xs text-muted-foreground uppercase">Total Equity</div>
                        <div className="text-3xl font-bold tabular mt-1">{fmtUsd(totals.equity)}</div>
                        <div className="text-xs text-up mt-1">{fmtPct(2.14)} (24h)</div>
                    </div>
                    <Stat label="Available Balance" value={fmtUsd(totals.available)} />
                    <Stat label="Margin Used" value={fmtUsd(totals.marginUsed)} />
                    <Stat label="Unrealized PnL" value={fmtUsd(totals.upnl)} tone={totals.upnl >= 0 ? "up" : "down"} />
                    <div className="flex flex-wrap gap-2 items-start sm:justify-end">
                        <Action icon={ArrowDownToLine} label="Deposit" onClick={() => setModal({ kind: "Deposit", asset: "USDT" })} />
                        <Action icon={ArrowUpFromLine} label="Withdraw" onClick={() => setModal({ kind: "Withdraw", asset: "USDT" })} />
                        <Action icon={ArrowLeftRight} label="Transfer" onClick={() => setModal({ kind: "Transfer", asset: "USDT" })} />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-border">
                {(
                    [
                        ["overview", "Overview"],
                        ["spot", "Spot Wallet"],
                        ["futures", "Futures Wallet"],
                        ["funding", "Funding"],
                        ["history", "Transaction History"],
                    ] as const
                ).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k as Tab)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l}</button>
                ))}
            </div>

            {tab === "overview" && (
                <div className="grid lg:grid-cols-[1fr_360px] gap-6">
                    <AssetTable rows={balances} search={search} setSearch={setSearch} onAction={(a, asset) => setModal({ kind: a, asset })} />
                    <FuturesCard />
                </div>
            )}

            {tab === "spot" && (
                <AssetTable rows={balances} search={search} setSearch={setSearch} onAction={(a, asset) => setModal({ kind: a, asset })} />
            )}

            {tab === "futures" && (
                <div className="grid lg:grid-cols-[360px_1fr] gap-6">
                    <FuturesCard />
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Open Positions</div>
                        {POSITIONS.filter((p) => p.status === "open").map((p) => (
                            <div key={p.id} className="flex items-center justify-between px-4 py-3 border-t border-border first:border-0">
                                <div>
                                    <div className="text-sm font-semibold">{p.market}</div>
                                    <div className={`text-xs ${p.side === "long" ? "text-up" : "text-down"}`}>{p.side.toUpperCase()} · {p.leverage}x</div>
                                </div>
                                <div className="text-right tabular">
                                    <div className={`text-sm font-semibold ${p.pnl >= 0 ? "text-up" : "text-down"}`}>{p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)} USDT</div>
                                    <div className={`text-[11px] ${p.roe >= 0 ? "text-up" : "text-down"}`}>{fmtPct(p.roe)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === "funding" && (
                <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
                    Funding account holds your unallocated assets. Use Transfer to move between Spot / Futures / Funding.
                    <div className="mt-4"><Button onClick={() => setModal({ kind: "Transfer", asset: "USDT" })} className="bg-primary hover:bg-brand-active text-primary-foreground font-semibold">Transfer Funds</Button></div>
                </div>
            )}

            {tab === "history" && <TxHistoryTable />}

            <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
                {modal && (
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{modal.kind} {modal.asset}</DialogTitle>
                            <DialogDescription>Demo only — no real funds move.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                            {modal.kind === "Transfer" && (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <label className="text-muted-foreground">From</label>
                                        <select className="w-full mt-1 h-9 rounded-md border border-border bg-elevated px-2 text-sm"><option>Spot</option><option>Futures</option><option>Funding</option></select>
                                    </div>
                                    <div>
                                        <label className="text-muted-foreground">To</label>
                                        <select className="w-full mt-1 h-9 rounded-md border border-border bg-elevated px-2 text-sm"><option>Futures</option><option>Spot</option><option>Funding</option></select>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="text-xs text-muted-foreground">Amount ({modal.asset})</label>
                                <Input className="mt-1 bg-elevated border-border tabular" placeholder="0.00" />
                            </div>
                            {modal.kind === "Deposit" && (
                                <div className="rounded-md bg-elevated p-3 text-[11px] text-muted-foreground break-all">
                                    Deposit Address (demo): <span className="text-primary">nx1q7f2…demoonly…wxlm</span>
                                </div>
                            )}
                            {modal.kind === "Withdraw" && (
                                <div>
                                    <label className="text-xs text-muted-foreground">Destination Address</label>
                                    <Input className="mt-1 bg-elevated border-border" placeholder="Paste address…" />
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
                            <Button className="bg-primary hover:bg-brand-active text-primary-foreground font-semibold" onClick={() => { toast.success(`${modal.kind} submitted`, { description: "Demo only — no real funds move." }); setModal(null); }}>
                                Confirm {modal.kind}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
    const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "";
    return (
        <div>
            <div className="text-xs text-muted-foreground uppercase">{label}</div>
            <div className={`text-xl font-bold tabular mt-1 ${c}`}>{value}</div>
        </div>
    );
}

function Action({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
    return (
        <Button onClick={onClick} variant="secondary" className="bg-elevated hover:bg-elevated/80 border border-border h-9 text-sm font-medium">
            <Icon className="h-4 w-4" />{label}
        </Button>
    );
}

function AssetTable({ rows, search, setSearch, onAction }: { rows: typeof BALANCES; search: string; setSearch: (v: string) => void; onAction: (a: "Deposit" | "Withdraw" | "Transfer", asset: string) => void }) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <h3 className="font-semibold">Assets</h3>
                <div className="relative w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8 h-8 bg-elevated border-border text-sm" placeholder="Search asset" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-elevated/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-4 py-2.5 text-left">Asset</th>
                            <th className="px-3 py-2.5 text-right">Total Balance</th>
                            <th className="px-3 py-2.5 text-right">Available</th>
                            <th className="px-3 py-2.5 text-right">In Orders</th>
                            <th className="px-3 py-2.5 text-right">USD Value</th>
                            <th className="px-3 py-2.5 text-right">24h</th>
                            <th className="px-3 py-2.5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No assets match.</td></tr>}
                        {rows.map((b) => (
                            <tr key={b.asset} className="border-t border-border hover:bg-elevated/50">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <Image
                                            src={`https://backpack.exchange/coins/${b.asset.toLocaleLowerCase()}.png`}
                                            alt={`${b.asset} Logo`}
                                            width={30}
                                            height={30}
                                            className="z-10 mr-5 rounded-full"
                                        />
                                        <div>
                                            <div className="font-semibold">{b.asset}</div>
                                            <div className="text-[11px] text-muted-foreground">{fmtUsd(b.usdPrice, b.usdPrice >= 1 ? 2 : 4)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3 text-right tabular">{fmtAmount(b.total, 6)}</td>
                                <td className="px-3 py-3 text-right tabular">{fmtAmount(b.available, 6)}</td>
                                <td className="px-3 py-3 text-right tabular text-muted-foreground">{fmtAmount(b.inOrders, 6)}</td>
                                <td className="px-3 py-3 text-right tabular font-medium">{fmtUsd(b.total * b.usdPrice)}</td>
                                <td className={`px-3 py-3 text-right tabular ${b.change24h >= 0 ? "text-up" : b.change24h < 0 ? "text-down" : "text-muted-foreground"}`}>{b.change24h === 0 ? "—" : fmtPct(b.change24h)}</td>
                                <td className="px-3 py-3 text-right">
                                    <div className="inline-flex gap-1">
                                        <Mini onClick={() => onAction("Deposit", b.asset)}>Deposit</Mini>
                                        <Mini onClick={() => onAction("Withdraw", b.asset)}>Withdraw</Mini>
                                        <Mini onClick={() => onAction("Transfer", b.asset)}>Transfer</Mini>
                                        <Mini asLink to={`/trade`} search={{ symbol: `${b.asset === "USDT" || b.asset === "USDC" ? "BTC" : b.asset}/USDT` }} accent>Trade</Mini>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Mini({ children, onClick, asLink, to, search, accent }: any) {
    const cls = `text-[11px] px-2 py-1 rounded border ${accent ? "border-primary text-primary hover:bg-primary hover:text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`;
    if (asLink) return <Link href={to} className={cls}>{children}</Link>;
    return <button onClick={onClick} className={cls}>{children}</button>;
}

function FuturesCard() {
    return (
        <div className="rounded-xl border border-border bg-card p-5 h-fit">
            <h3 className="font-semibold mb-4">Futures Wallet</h3>
            <div className="space-y-3 text-sm">
                <FRow k="Margin Balance" v="$5,820.42" />
                <FRow k="Maintenance Margin" v="$420.11" />
                <FRow k="Unrealized PnL" v="+$989.45" tone="up" />
                <FRow k="Open Positions" v="3" />
                <FRow k="Risk Ratio" v="12.4%" tone="up" />
            </div>
            <Button asChild className="w-full mt-5 bg-primary hover:bg-brand-active text-primary-foreground font-semibold">
                <Link href="/trade">Open Futures Terminal</Link>
            </Button>
        </div>
    );
}

function FRow({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
    const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "";
    return (
        <div className="flex justify-between">
            <span className="text-muted-foreground">{k}</span>
            <span className={`tabular font-medium ${c}`}>{v}</span>
        </div>
    );
}

function TxHistoryTable() {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-elevated/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-4 py-2.5 text-left">Type</th>
                            <th className="px-3 py-2.5 text-left">Asset</th>
                            <th className="px-3 py-2.5 text-right">Amount</th>
                            <th className="px-3 py-2.5 text-left">Status</th>
                            <th className="px-3 py-2.5 text-left">Time</th>
                            <th className="px-3 py-2.5 text-left">Tx</th>
                        </tr>
                    </thead>
                    <tbody>
                        {WALLET_TX.map((t) => (
                            <tr key={t.id} className="border-t border-border hover:bg-elevated/50">
                                <td className="px-4 py-3 font-medium">{t.type}</td>
                                <td className="px-3 py-3">{t.asset}</td>
                                <td className={`px-3 py-3 text-right tabular ${t.amount > 0 ? "text-up" : t.amount < 0 ? "text-down" : ""}`}>{t.amount > 0 ? "+" : ""}{t.amount}</td>
                                <td className="px-3 py-3">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${t.status === "Completed" ? "bg-up/20 text-up" : "bg-primary/20 text-primary"}`}>{t.status}</span>
                                </td>
                                <td className="px-3 py-3 text-muted-foreground tabular">{t.time}</td>
                                <td className="px-3 py-3 text-muted-foreground tabular">{t.tx}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
