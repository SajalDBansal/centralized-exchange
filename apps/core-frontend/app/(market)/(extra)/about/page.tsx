import { Globe2, Shield, Users, Zap, Code2, Building2 } from "lucide-react";
import Link from "next/link";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
    title: "About",
    description: "Learn about NexaX and our mission to build precise, secure, and professional crypto trading infrastructure for every kind of trader.",
    path: "/about",
    keywords: ["about NexaX", "crypto exchange platform", "professional trading infrastructure"],
});

export default function AboutPage() {
    return (
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-14">
            <div className="inline-flex rounded-full bg-card border border-border px-3 py-1 text-xs text-muted-foreground">About NexaX</div>
            <h1 className="mt-4 text-4xl lg:text-5xl font-bold tracking-tight">Built for traders who care about the details.</h1>
            <p className="mt-4 text-muted-foreground max-w-3xl text-lg">
                NexaX is a professional centralized crypto exchange interface, designed around the workflows of high-frequency
                and discretionary traders. This site is a frontend demo — all data is mocked, but every surface is built to the
                density and clarity of a production trading venue.
            </p>

            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    { i: Globe2, t: "Global by Design", d: "180+ countries, 14 languages on the roadmap, 24/7 operations." },
                    { i: Shield, t: "Security First", d: "Multi-sig cold storage, on-chain proof of reserves, hardware-backed signing." },
                    { i: Zap, t: "Sub-millisecond Match", d: "In-memory matching engine with deterministic order routing." },
                    { i: Users, t: "Trader-led Product", d: "Built by ex-market-makers, quants, and exchange engineers." },
                    { i: Code2, t: "Open API & SDK", d: "REST, WebSocket, and FIX with first-class TypeScript and Python clients." },
                    { i: Building2, t: "Institutional Ready", d: "Sub-accounts, role-based access, dedicated OTC and prime services." },
                ].map(({ i: Icon, t, d }) => (
                    <div key={t} className="rounded-xl border border-border bg-card p-6">
                        <Icon className="h-5 w-5 text-primary" />
                        <h3 className="mt-3 font-semibold">{t}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                    </div>
                ))}
            </div>

            <div className="mt-16 grid lg:grid-cols-2 gap-10">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Our mission</h2>
                    <p className="mt-3 text-muted-foreground">
                        Crypto market structure deserves the same rigor as traditional finance. We&apos;re building the interface, risk
                        engine, and tooling so that anyone — from a self-directed retail trader to a $500M fund — can express their
                        view on-chain with the same precision.
                    </p>
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">By the numbers</h2>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                        {[
                            { l: "Founded", v: "2024" },
                            { l: "Headcount", v: "120+" },
                            { l: "Markets", v: "240+" },
                            { l: "24h Volume", v: "$8.4B" },
                        ].map((s) => (
                            <div key={s.l} className="rounded-lg border border-border bg-card p-4">
                                <div className="text-xs text-muted-foreground">{s.l}</div>
                                <div className="text-2xl font-bold tabular mt-1">{s.v}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-16 rounded-2xl bg-card border border-border p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold">Want to trade on NexaX?</h3>
                    <p className="text-sm text-muted-foreground">Open the demo terminal and explore every surface.</p>
                </div>
                <Link href="/trade" className="rounded-md bg-primary text-primary-foreground font-semibold px-5 py-2.5 text-sm">Launch Terminal</Link>
            </div>
        </div>
    );
}
