
import { ArrowRight, ArrowUp, ArrowDown, BarChart3, BookOpen, Layers, ShieldCheck, Snowflake, Sparkles, Wallet, Zap, LucideIcon } from "lucide-react";
import { MARKETS } from "@/lib/mock-data";
import { fmtPrice, fmtPct, fmtCompact } from "@/lib/format";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";
import { getTickers, highestVolumeMarkets, topGainersMarkets, topLosersMarkets } from "@/utils/http-client";
import { TickerB } from "@workspace/types";
import Image from "next/image";
import { isPerp, symbolParts } from "@/lib/market-ops";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Spot & Perpetual Crypto Trading",
  description: "Trade live spot and perpetual crypto markets with real-time prices, advanced charts, deep order books, and professional tools on NexaX.",
  path: "/",
  keywords: ["crypto trading platform", "spot crypto trading", "perpetual futures exchange"],
});

export default async function HomePage() {
  const tickers = await getTickers();

  const topGainers = topGainersMarkets(tickers).slice(0, 5);
  const topLosers = topLosersMarkets(tickers).slice(0, 5);
  const highVolume = highestVolumeMarkets(tickers).slice(0, 5);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_oklch(0.86_0.17_90/0.10),_transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div className="w-full max-w-xl shrink-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Demo environment with mock data
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
              Trade spot and perpetual crypto markets with{" "}
              <span className="text-primary">professional tools</span>.
            </h1>
            <p className="mt-5 text-base lg:text-lg text-muted-foreground max-w-xl">
              NexaX is a serious centralized exchange interface: deep order books, advanced order types,
              and a high-density trading terminal — all in one place.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="h-11 px-6 bg-primary hover:bg-brand-active text-primary-foreground font-semibold">
                <Link href="/trade">Start Trading <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="secondary" className="h-11 px-6 bg-card hover:bg-elevated">
                <Link href="/markets">View Markets</Link>
              </Button>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <Stat label="24h Volume" value="$8.42B" />
              <Stat label="Markets" value="240+" />
              <Stat label="Uptime" value="99.99%" />
            </div>
          </div>
          <div className="flex-1 w-full">
            <MockTerminalPreview />
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="border-y border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { l: "24h Volume", v: "$8,421,300,000" },
            { l: "Listed Markets", v: "240+" },
            { l: "Maker Fee", v: "0.02%" },
            { l: "Taker Fee", v: "0.05%" },
            { l: "Uptime", v: "99.99%" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className="text-lg font-bold tabular mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Everything you need to trade</h2>
        <p className="mt-2 text-muted-foreground">A complete trading suite, from spot books to perpetual leverage.</p>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Feature icon={Layers} title="Spot & Perpetual Markets" desc="Trade 200+ spot pairs and perp contracts with deep liquidity." />
          <Feature icon={BarChart3} title="TradingView-style Charts" desc="Professional candlestick charts with timeframes and indicators." />
          <Feature icon={BookOpen} title="Deep Order Book" desc="Real-time depth, recent trades, and price ladder." />
          <Feature icon={Wallet} title="Portfolio & Wallet" desc="Unified balances, PnL, and transaction history in one view." />
          <Feature icon={Zap} title="Advanced Order Types" desc="Limit, Market, Stop-Limit, Stop-Market, Post-only, Reduce-only." />
          <Feature icon={Sparkles} title="Demo Environment" desc="Risk-free UI prototype powered by static mock data." />
        </div>
      </section>

      {/* Movers */}
      <section className="bg-card/40 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-14 grid lg:grid-cols-3 gap-6">
          <MoverCard title="Top Gainers" rows={topGainers} positive />
          <MoverCard title="Top Losers" rows={topLosers} />
          <MoverCard title="Highest Volume" rows={highVolume} showVolume />
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Built on a foundation of trust</h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TrustCard icon={ShieldCheck} title="Proof of Reserves" desc="On-chain attestations covering 100%+ of user assets." />
          <TrustCard icon={Snowflake} title="Cold Storage" desc="Majority of assets stored offline in multi-sig vaults." />
          <TrustCard icon={Zap} title="Risk Controls" desc="Real-time risk engine with circuit breakers." />
          <TrustCard icon={BookOpen} title="Compliance" desc="Comprehensive AML and KYC frameworks." />
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 pb-20">
        <div className="rounded-2xl bg-card border border-border p-10 lg:p-14 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl lg:text-3xl font-bold tracking-tight">Secure, low-fee trading on NexaX</h3>
            <p className="mt-2 text-muted-foreground">Open the terminal and explore the full prototype.</p>
          </div>
          <Button asChild className="h-11 px-6 bg-primary hover:bg-brand-active text-primary-foreground font-semibold">
            <Link href="/trade">Launch Terminal <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular mt-1">{value}</div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
      <div className="h-9 w-9 rounded-md bg-elevated grid place-items-center text-primary"><Icon className="h-4 w-4" /></div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function TrustCard({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function MoverCard({ title, rows, positive, showVolume }: { title: string; rows: TickerB[]; positive?: boolean; showVolume?: boolean }) {

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <Link href="/markets" className="text-xs text-muted-foreground hover:text-primary">View all →</Link>
      </div>
      <div>
        {rows.map((m) => {
          const { base, display } = symbolParts(m.symbol);
          const perpetual = isPerp(m);
          const numberValue = (value: string) => Number(value) || 0;
          const change = numberValue(m.priceChangePercent) * 100;

          return (
            <Link
              key={m.symbol}
              href={`/trade?symbol=${m.symbol}`}
              // search={{ symbol: m.symbol }}
              className="flex items-center justify-between px-5 py-3 border-b border-border last:border-0 hover:bg-elevated"
            >
              <div className="flex items-center gap-2.5">
                <Image
                  src={`https://backpack.exchange/coins/${base.toLocaleLowerCase()}.png`}
                  alt={`${base} Logo`}
                  width={30}
                  height={30}
                  className="z-10 mr-5 rounded-full"
                />
                <div>
                  <div className="text-sm font-semibold">{display}</div>
                  <div className="text-[11px] text-muted-foreground">{perpetual ? "PERP" : "SPOT"}</div>
                </div>
              </div>
              <div className="text-right tabular">
                <div className="text-sm font-medium">{showVolume ? fmtCompact(numberValue(m.quoteVolume)) : fmtPrice(numberValue(m.lastPrice))}</div>
                <div className={`text-xs flex items-center justify-end gap-0.5 ${change >= 0 ? "text-up" : "text-down"}`}>
                  {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {fmtPct(change, false)}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      {void positive}
    </div>
  );
}

function MockTerminalPreview() {
  const btc = MARKETS.find((m) => m.symbol === "BTC/USDT")!;
  const fakeSize = (i: number) => ((i * 7919) % 1500) / 1000;

  return (
    // <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xl">
    <div className="w-full rounded-xl border border-border bg-card overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-elevated grid place-items-center font-bold">{btc.icon}</div>
          <div>
            <div className="text-sm font-bold">BTC/USDT</div>
            <div className="text-[11px] text-muted-foreground">Spot</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular">{fmtPrice(btc.price)}</div>
          <div className={`text-xs tabular ${btc.change24h >= 0 ? "text-up" : "text-down"}`}>{fmtPct(btc.change24h)}</div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_140px]">
        <div className="p-3 border-r border-border h-full">
          <MiniChart />
          <div className="flex gap-1 mt-2">
            {["1m", "5m", "15m", "1h", "4h", "1D"].map((t) => (
              <div key={t} className={`px-2 py-0.5 text-[10px] rounded ${t === "1h" ? "bg-elevated text-foreground" : "text-muted-foreground"}`}>{t}</div>
            ))}
          </div>
        </div>
        <div className="text-[10px] tabular p-2 space-y-0.5">
          <div className="text-muted-foreground flex justify-between px-1"><span>Price</span><span>Size</span></div>
          {[5, 4, 3, 2, 1].map((i) => (
            <div key={`a${i}`} className="flex justify-between px-1 text-down">
              <span>{fmtPrice(btc.price + i * 12)}</span>
              <span>{fakeSize(i).toFixed(3)}</span>
            </div>
          ))}
          <div className="text-center font-bold py-1 border-y border-border my-1">{fmtPrice(btc.price)}</div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={`b${i}`} className="flex justify-between px-1 text-up">
              <span>{fmtPrice(btc.price - i * 12)}</span>
              <span>{fakeSize(i).toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 border-t border-border">
        <button className="bg-up text-background font-semibold rounded py-1.5 text-xs">Buy</button>
        <button className="bg-down text-background font-semibold rounded py-1.5 text-xs">Sell</button>
      </div>
    </div>
  );
}

function MiniChart() {
  const pts = Array.from({ length: 40 }, (_, i) => {
    return (
      60 +
      Math.sin(i / 3) * 10 +
      Math.cos(i * 1.7) * 4 +
      Math.sin(i * 0.6) * 2
    );
  });

  const max = Math.max(...pts);
  const min = Math.min(...pts);

  return (
    <svg viewBox="0 0 200 80" className="w-full">
      {pts.map((p, i) => {
        const x = (i / (pts.length - 1)) * 200;
        const h = ((p - min) / (max - min)) * 70 + 5;
        const y = 80 - h;
        const up = i === 0 || p >= pts[i - 1]!;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={3}
            height={h}
            fill={up ? "var(--color-up)" : "var(--color-down)"}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
