import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
    title: "Wallet & Portfolio",
    description: "View your NexaX portfolio, balances, positions, funding activity, and transaction history in one place.",
    path: "/wallet",
    keywords: ["crypto wallet", "crypto portfolio", "trading balances", "futures positions"],
    noIndex: true,
});

export default function WalletLayout({ children }: Readonly<{ children: ReactNode }>) {
    return children;
}
