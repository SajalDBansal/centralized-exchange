"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, User, Gift, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";

export default function SignUpPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [pwd, setPwd] = useState("");
    const [show, setShow] = useState(false);
    const [ref, setRef] = useState("");
    const [agree, setAgree] = useState(false);
    const [loading, setLoading] = useState(false);

    const strength = (() => {
        let s = 0;
        if (pwd.length >= 8) s++;
        if (/[A-Z]/.test(pwd)) s++;
        if (/[0-9]/.test(pwd)) s++;
        if (/[^A-Za-z0-9]/.test(pwd)) s++;
        return s;
    })();

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !pwd) return toast.error("Fill all required fields");
        if (!agree) return toast.error("Accept the terms to continue");
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            toast.success("Account created (demo)", { description: "Frontend only — no real account." });
            router.push("/trade");
        }, 800);
    };

    return (
        <div className="min-h-[calc(100vh)] grid lg:grid-cols-2">
            <div className="flex items-center justify-center p-6 lg:p-12 order-2 lg:order-1">
                <form onSubmit={submit} className="w-full max-w-sm space-y-5">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Already have one?{" "}
                            <Link href="/signin" className="text-primary hover:underline font-medium">Sign in</Link>
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="name">Full name</Label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="name" placeholder="Satoshi Nakamoto" className="pl-9 h-10 bg-card border-border" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="email" type="email" placeholder="you@example.com" className="pl-9 h-10 bg-card border-border" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="pwd">Password</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="pwd" type={show ? "text" : "password"} placeholder="At least 8 characters" className="pl-9 pr-9 h-10 bg-card border-border" value={pwd} onChange={(e) => setPwd(e.target.value)} />
                            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        <div className="flex gap-1 mt-1.5">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className={`h-1 flex-1 rounded ${i <= strength ? (strength <= 1 ? "bg-down" : strength <= 2 ? "bg-primary/60" : strength <= 3 ? "bg-primary" : "bg-up") : "bg-border"}`} />
                            ))}
                        </div>
                        <div className="text-[11px] text-muted-foreground">8+ chars, mix upper/lowercase, number & symbol.</div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ref">Referral code <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <div className="relative">
                            <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="ref" placeholder="NEXAX" className="pl-9 h-10 bg-card border-border" value={ref} onChange={(e) => setRef(e.target.value)} />
                        </div>
                    </div>

                    <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                        <button type="button" onClick={() => setAgree((a) => !a)} className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${agree ? "bg-primary border-primary" : "border-border bg-card"}`}>
                            {agree && <Check className="h-3 w-3 text-primary-foreground" />}
                        </button>
                        <span>
                            I agree to the <span className="text-primary hover:underline">Terms of Service</span> and{" "}
                            <span className="text-primary hover:underline">Privacy Policy</span>, and confirm I am 18+.
                        </span>
                    </label>

                    <Button type="submit" disabled={loading} className="w-full h-10 bg-primary hover:bg-brand-active text-primary-foreground font-semibold">
                        {loading ? "Creating account…" : "Create account"}
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                        <div className="relative flex justify-center text-[11px] uppercase">
                            <span className="bg-background px-2 text-muted-foreground">or sign up with</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => toast("Demo only")} className="h-10 rounded-md border border-border bg-card hover:bg-elevated text-sm font-medium">Google</button>
                        <button type="button" onClick={() => toast("Demo only")} className="h-10 rounded-md border border-border bg-card hover:bg-elevated text-sm font-medium">Apple</button>
                        <button type="button" onClick={() => toast("Demo only")} className="h-10 rounded-md border border-border bg-card hover:bg-elevated text-sm font-medium">Wallet</button>
                    </div>
                </form>
            </div>

            <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-bl from-card to-background border-l border-border order-1 lg:order-2">
                <div className="ml-auto">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md bg-primary grid place-items-center text-primary-foreground font-black">N</div>
                        <span className="text-xl font-bold">NexaX</span>
                    </Link>
                </div>
                <div>
                    <h2 className="text-4xl font-bold leading-tight tracking-tight">Open an account in seconds.</h2>
                    <p className="mt-4 text-muted-foreground max-w-md">No KYC required for the demo. Explore the full trading terminal with mock balances and order flow.</p>
                    <ul className="mt-8 space-y-3 text-sm">
                        {[
                            "0.02% maker / 0.05% taker fees",
                            "200+ spot pairs and perp contracts",
                            "Up to 100x leverage on perpetuals",
                            "Deep order books and pro tooling",
                        ].map((l) => (
                            <li key={l} className="flex items-center gap-2"><Check className="h-4 w-4 text-up" /> {l}</li>
                        ))}
                    </ul>
                </div>
                <div className="text-xs text-muted-foreground">© 2026 NexaX · Frontend demo</div>
            </div>
        </div>
    );
}
