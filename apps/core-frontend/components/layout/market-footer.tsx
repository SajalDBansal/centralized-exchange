import Link from "next/link";

export function Footer() {

    return (
        <footer className="border-t border-border bg-card/40">
            <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
                <div>© 2026 NexaX. Frontend demo only — no real trading.</div>
                <div className="flex gap-4">
                    <Link href={"/about"}>About</Link>
                    <Link href={"/fees"}>Fees</Link>
                    <Link href={"/docs"}>DOCS</Link>
                    <Link href={"/security"}>Security</Link>
                    <Link href={"/support"}>Support</Link>
                </div>
            </div>
        </footer>
    );
}