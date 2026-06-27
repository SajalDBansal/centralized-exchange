"use client"
import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, MessageCircle, Mail, BookOpen, ChevronDown } from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";

const FAQ = [
    { q: "How do I deposit crypto?", a: "Go to Wallet → Deposit, choose an asset and network, and send to the generated address. Funds typically arrive after 2–6 network confirmations." },
    { q: "Why is my withdrawal pending?", a: "New withdrawals can be held for review during the 24h cool-down window if the destination address is not whitelisted, or pending KYC checks." },
    { q: "How are funding fees calculated on perpetuals?", a: "Funding is exchanged every 8 hours based on the difference between perpetual and index price. The rate is shown on the trade page header." },
    { q: "Can I close my account?", a: "Yes — withdraw all balances, then visit Settings → Account → Close Account. Account closure is permanent." },
    { q: "Do you support API trading?", a: "Yes. We expose REST, WebSocket, and FIX endpoints. Generate keys from Settings → API and review rate limits in the developer docs." },
    { q: "What is the maker / taker model?", a: "Maker orders add liquidity (rest on the book) and pay lower fees. Taker orders remove liquidity (cross the spread) and pay slightly higher fees." },
];

export default function SupportPage() {
    const [open, setOpen] = useState<number | null>(0);
    const [topic, setTopic] = useState("");
    const [msg, setMsg] = useState("");
    const [email, setEmail] = useState("");

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !topic || !msg) return toast.error("Fill all fields");
        toast.success("Ticket submitted (demo)", { description: "Our team will reply within 24h." });
        setMsg("");
        setTopic("");
    };

    return (
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-14">
            <h1 className="text-4xl font-bold tracking-tight">How can we help?</h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">
                Browse common answers, or get in touch with our support team — humans, 24/7.
            </p>

            <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { i: LifeBuoy, t: "Help Center", d: "Step-by-step guides" },
                    { i: MessageCircle, t: "Live Chat", d: "Avg. < 2 min wait" },
                    { i: Mail, t: "Email", d: "support@nexax.demo" },
                    { i: BookOpen, t: "API Docs", d: "Developers and quants" },
                ].map(({ i: Icon, t, d }) => (
                    <button key={t} onClick={() => toast(t, { description: "Demo only" })} className="text-left rounded-xl border border-border bg-card p-5 hover:border-primary/40">
                        <Icon className="h-5 w-5 text-primary" />
                        <h3 className="mt-3 font-semibold">{t}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{d}</p>
                    </button>
                ))}
            </div>

            <div className="mt-12 grid lg:grid-cols-[1.4fr_1fr] gap-8">
                <div>
                    <h2 className="text-xl font-bold">Frequently asked</h2>
                    <div className="mt-4 rounded-xl border border-border bg-card divide-y divide-border">
                        {FAQ.map((f, i) => (
                            <div key={i}>
                                <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between text-left px-5 py-4">
                                    <span className="font-medium">{f.q}</span>
                                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open === i ? "rotate-180" : ""}`} />
                                </button>
                                {open === i && <div className="px-5 pb-4 text-sm text-muted-foreground">{f.a}</div>}
                            </div>
                        ))}
                    </div>
                </div>

                <form onSubmit={submit} className="rounded-xl border border-border bg-card p-6 space-y-4 h-fit">
                    <h2 className="text-xl font-bold">Open a ticket</h2>
                    <div className="space-y-1.5">
                        <Label htmlFor="t-email">Email</Label>
                        <Input id="t-email" type="email" className="h-10 bg-elevated border-border" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="t-topic">Topic</Label>
                        <select id="t-topic" className="h-10 w-full rounded-md bg-elevated border border-border px-3 text-sm" value={topic} onChange={(e) => setTopic(e.target.value)}>
                            <option value="">Select a topic…</option>
                            <option>Account & Verification</option>
                            <option>Deposits & Withdrawals</option>
                            <option>Trading & Orders</option>
                            <option>Fees</option>
                            <option>API & Developers</option>
                            <option>Security</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="t-msg">Message</Label>
                        <textarea id="t-msg" rows={6} className="w-full rounded-md bg-elevated border border-border px-3 py-2 text-sm" placeholder="Describe your issue…" value={msg} onChange={(e) => setMsg(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full h-10 bg-primary hover:bg-brand-active text-primary-foreground font-semibold">Submit ticket</Button>
                    <p className="text-[11px] text-muted-foreground">Demo only — no ticket is created.</p>
                </form>
            </div>
        </div>
    );
}
