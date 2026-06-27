import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
    title: "Trading Fees",
    description: "Review NexaX spot and perpetual maker-taker fees, volume-based VIP tiers, and digital asset withdrawal fees.",
    path: "/fees",
    keywords: ["crypto trading fees", "maker taker fees", "perpetual trading fees", "withdrawal fees"],
});

const tiers = [
    { tier: "Regular", vol: "< $1M", makerSpot: "0.10%", takerSpot: "0.10%", makerPerp: "0.02%", takerPerp: "0.05%" },
    { tier: "VIP 1", vol: "≥ $1M", makerSpot: "0.08%", takerSpot: "0.09%", makerPerp: "0.018%", takerPerp: "0.045%" },
    { tier: "VIP 2", vol: "≥ $5M", makerSpot: "0.06%", takerSpot: "0.08%", makerPerp: "0.014%", takerPerp: "0.04%" },
    { tier: "VIP 3", vol: "≥ $25M", makerSpot: "0.04%", takerSpot: "0.06%", makerPerp: "0.010%", takerPerp: "0.035%" },
    { tier: "VIP 4", vol: "≥ $100M", makerSpot: "0.02%", takerSpot: "0.05%", makerPerp: "0.005%", takerPerp: "0.030%" },
    { tier: "VIP 5", vol: "≥ $500M", makerSpot: "0.00%", takerSpot: "0.04%", makerPerp: "0.000%", takerPerp: "0.025%" },
    { tier: "Institutional", vol: "Custom", makerSpot: "Negotiated", takerSpot: "Negotiated", makerPerp: "Negotiated", takerPerp: "Negotiated" },
];

const withdrawals = [
    { asset: "BTC", net: "Bitcoin", fee: "0.00012 BTC", min: "0.0005 BTC" },
    { asset: "ETH", net: "Ethereum (ERC-20)", fee: "0.0018 ETH", min: "0.005 ETH" },
    { asset: "USDT", net: "Tron (TRC-20)", fee: "1 USDT", min: "10 USDT" },
    { asset: "USDT", net: "Ethereum (ERC-20)", fee: "4.2 USDT", min: "10 USDT" },
    { asset: "USDC", net: "Solana", fee: "0.1 USDC", min: "1 USDC" },
    { asset: "SOL", net: "Solana", fee: "0.001 SOL", min: "0.05 SOL" },
];

export default function FeesPage() {
    return (
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-14">
            <h1 className="text-4xl font-bold tracking-tight">Trading Fees</h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">
                Transparent, competitive fees across spot and perpetual markets. Discounts scale with your rolling 30-day volume.
            </p>

            <div className="mt-10 grid sm:grid-cols-3 gap-4">
                {[
                    { l: "Spot Maker (Regular)", v: "0.10%" },
                    { l: "Perp Taker (Regular)", v: "0.05%" },
                    { l: "Volume tier window", v: "30 days" },
                ].map((s) => (
                    <div key={s.l} className="rounded-xl border border-border bg-card p-5">
                        <div className="text-xs text-muted-foreground">{s.l}</div>
                        <div className="text-2xl font-bold tabular mt-1">{s.v}</div>
                    </div>
                ))}
            </div>

            <div className="mt-12">
                <h2 className="text-xl font-bold">Fee Schedule</h2>
                <div className="mt-4 rounded-xl border border-border bg-card overflow-x-auto">
                    <table className="w-full text-sm tabular">
                        <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                            <tr>
                                <th className="text-left px-4 py-3">Tier</th>
                                <th className="text-left px-4 py-3">30d Volume</th>
                                <th className="text-right px-4 py-3">Spot Maker</th>
                                <th className="text-right px-4 py-3">Spot Taker</th>
                                <th className="text-right px-4 py-3">Perp Maker</th>
                                <th className="text-right px-4 py-3">Perp Taker</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tiers.map((t) => (
                                <tr key={t.tier} className="border-b border-border last:border-0">
                                    <td className="px-4 py-3 font-semibold">{t.tier}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{t.vol}</td>
                                    <td className="px-4 py-3 text-right">{t.makerSpot}</td>
                                    <td className="px-4 py-3 text-right">{t.takerSpot}</td>
                                    <td className="px-4 py-3 text-right">{t.makerPerp}</td>
                                    <td className="px-4 py-3 text-right">{t.takerPerp}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-12">
                <h2 className="text-xl font-bold">Withdrawal Fees</h2>
                <div className="mt-4 rounded-xl border border-border bg-card overflow-x-auto">
                    <table className="w-full text-sm tabular">
                        <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                            <tr>
                                <th className="text-left px-4 py-3">Asset</th>
                                <th className="text-left px-4 py-3">Network</th>
                                <th className="text-right px-4 py-3">Fee</th>
                                <th className="text-right px-4 py-3">Min Withdrawal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {withdrawals.map((w, i) => (
                                <tr key={i} className="border-b border-border last:border-0">
                                    <td className="px-4 py-3 font-semibold">{w.asset}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{w.net}</td>
                                    <td className="px-4 py-3 text-right">{w.fee}</td>
                                    <td className="px-4 py-3 text-right">{w.min}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="mt-8 text-xs text-muted-foreground">Demo fee schedule — illustrative only.</p>
        </div>
    );
}
