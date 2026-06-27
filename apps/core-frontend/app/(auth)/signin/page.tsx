"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, ShieldCheck, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";

export default function SignInPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [pwd, setPwd] = useState("");
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !pwd) return toast.error("Enter email and password");
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            toast.success("Signed in (demo)", { description: "Frontend only — no real session." });
            router.push("/trade");
        }, 700);
    };

    return (
        <div className="min-h-[calc(100vh)] grid lg:grid-cols-2">
            <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-card to-background border-r border-border">
                <Link href="/" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-primary grid place-items-center text-primary-foreground font-black">N</div>
                    <span className="text-xl font-bold">NexaX</span>
                </Link>
                <div>
                    <h2 className="text-4xl font-bold leading-tight tracking-tight">Welcome back to the terminal.</h2>
                    <p className="mt-4 text-muted-foreground max-w-md">
                        Pro-grade order books, advanced order types, and a high-density interface — built for serious traders.
                    </p>
                    <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
                        <div><div className="text-2xl font-bold tabular">$8.4B</div><div className="text-xs text-muted-foreground">24h Volume</div></div>
                        <div><div className="text-2xl font-bold tabular">240+</div><div className="text-xs text-muted-foreground">Markets</div></div>
                        <div><div className="text-2xl font-bold tabular">99.99%</div><div className="text-xs text-muted-foreground">Uptime</div></div>
                    </div>
                </div>
                <div className="text-xs text-muted-foreground">© 2026 NexaX · Frontend demo</div>
            </div>

            <div className="flex items-center justify-center p-6 lg:p-12">
                <form onSubmit={submit} className="w-full max-w-sm space-y-5">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            New here?{" "}
                            <Link href="/signup" className="text-primary hover:underline font-medium">Create an account</Link>
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="email" type="email" placeholder="you@example.com" className="pl-9 h-10 bg-card border-border"
                                value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="pwd">Password</Label>
                            <button type="button" onClick={() => toast("Password reset link sent (demo)")} className="text-xs text-primary hover:underline">Forgot?</button>
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="pwd" type={show ? "text" : "password"} placeholder="••••••••" className="pl-9 pr-9 h-10 bg-card border-border"
                                value={pwd} onChange={(e) => setPwd(e.target.value)} />
                            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full h-10 bg-primary hover:bg-brand-active text-primary-foreground font-semibold">
                        {loading ? "Signing in…" : "Sign in"}
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                        <div className="relative flex justify-center text-[11px] uppercase">
                            <span className="bg-background px-2 text-muted-foreground">or continue with</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => toast("Demo only")} className="h-10 rounded-md border border-border bg-card hover:bg-elevated text-sm font-medium">Google</button>
                        <button type="button" onClick={() => toast("Demo only")} className="h-10 rounded-md border border-border bg-card hover:bg-elevated text-sm font-medium">Apple</button>
                        <button type="button" onClick={() => toast("Demo only")} className="h-10 rounded-md border border-border bg-card hover:bg-elevated text-sm font-medium">Wallet</button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Protected by NexaX security. Enable 2FA after sign-in.
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <KeyRound className="h-3.5 w-3.5 text-primary" />
                        Demo environment — no real credentials are stored.
                    </div>
                </form>
            </div>
        </div>
    );
}
