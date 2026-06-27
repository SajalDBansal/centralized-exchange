"use client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Bell, Search, Sun, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

const links = [
    { to: "/", label: "Home" },
    { to: "/markets", label: "Markets" },
    { to: "/trade", label: "Trade" },
    { to: "/wallet", label: "Wallet" },
];

export function Navbar() {
    const pathname = usePathname();
    const demo = () => toast("Frontend demo only", { description: "NexaX is a UI prototype — no real trading or auth." });

    return (
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
            <div className="flex h-14 items-center gap-6 px-4 lg:px-6">
                <Link href="/" className="flex items-center gap-2 shrink-0">
                    <div className="h-7 w-7 rounded-md bg-primary grid place-items-center text-primary-foreground font-black text-sm">N</div>
                    <span className="text-lg font-bold tracking-tight">NexaX</span>
                </Link>
                <nav className="hidden md:flex items-center gap-1">
                    {links.map((l) => {
                        const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
                        return (
                            <Link
                                key={l.to}
                                href={l.to}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${active ? "text-foreground bg-card" : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                {l.label}
                            </Link>
                        );
                    })}
                </nav>
                <div className="flex-1 max-w-xs ml-auto hidden lg:block">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search market pair…"
                            className="pl-8 h-9 bg-card border-border"
                            onKeyDown={(e) => e.key === "Enter" && demo()}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4 ml-auto lg:ml-0">
                    <Button variant="ghost" size="icon" onClick={demo} aria-label="Notifications"><Bell className="h-4 w-4" /></Button>

                    <Button onClick={demo} className="h-9 bg-primary hover:bg-brand-active text-primary-foreground font-semibold">
                        Connect
                    </Button>

                    <Link href="/signin" className="h-8 w-8 rounded-full bg-card border border-border grid place-items-center text-xs font-semibold ml-1">
                        <User className="h-4 w-4" />
                    </Link>
                </div>
            </div>
        </header>
    );
}