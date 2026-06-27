import { ShieldCheck, Snowflake, KeyRound, Lock, Eye, FileCheck2, Server, AlertTriangle } from "lucide-react";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
    title: "Security",
    description: "Explore the account protection, custody, infrastructure isolation, and operational security practices illustrated by NexaX.",
    path: "/security",
    keywords: ["crypto exchange security", "cold storage", "two-factor authentication", "proof of reserves"],
});

export default function SecurityPage() {
    return (
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-14">
            <div className="inline-flex rounded-full bg-card border border-border px-3 py-1 text-xs text-muted-foreground">Security</div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight">Funds safety is the product.</h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">
                Every layer of NexaX — from cold-storage custody to per-account 2FA — is designed so that you, and only you,
                control your assets.
            </p>

            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    { i: Snowflake, t: "Cold Storage", d: "95%+ of user assets held in geographically distributed multi-sig vaults, offline." },
                    { i: ShieldCheck, t: "Proof of Reserves", d: "Merkle-tree attestations published monthly. Verify your balance is included." },
                    { i: KeyRound, t: "2FA Everywhere", d: "TOTP, hardware keys (WebAuthn / FIDO2), and SMS backup for every account." },
                    { i: Lock, t: "Withdrawal Whitelist", d: "Lock withdrawals to pre-approved addresses with 24h cool-down on new ones." },
                    { i: Eye, t: "Anti-phishing Code", d: "Personal code in every email so you can spot impersonation instantly." },
                    { i: FileCheck2, t: "SOC 2 + ISO 27001", d: "Annual third-party audits of operational and information security controls." },
                    { i: Server, t: "Isolated Infrastructure", d: "Trading, custody, and user systems run in separated, hardened environments." },
                    { i: AlertTriangle, t: "Bug Bounty", d: "Up to $500,000 payout for critical reports via our HackerOne program." },
                ].map(({ i: Icon, t, d }) => (
                    <div key={t} className="rounded-xl border border-border bg-card p-6">
                        <Icon className="h-5 w-5 text-primary" />
                        <h3 className="mt-3 font-semibold">{t}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                    </div>
                ))}
            </div>

            <div className="mt-12 rounded-xl border border-border bg-card p-8">
                <h2 className="text-2xl font-bold tracking-tight">Best practices for your account</h2>
                <ol className="mt-4 space-y-3 text-sm text-muted-foreground list-decimal pl-5">
                    <li>Enable a hardware security key (YubiKey, Titan) for both login and withdrawals.</li>
                    <li>Set a withdrawal address whitelist and turn on the 24-hour cool-down.</li>
                    <li>Use a unique email address for your exchange — never reuse it for marketing or forums.</li>
                    <li>Verify your personal anti-phishing code in every NexaX email before clicking links.</li>
                    <li>Audit your active sessions and API keys weekly from Settings → Security.</li>
                </ol>
            </div>

            <p className="mt-8 text-xs text-muted-foreground">Frontend demo — security measures shown for illustration.</p>
        </div>
    );
}
