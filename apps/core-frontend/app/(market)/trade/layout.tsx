import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
    title: "Trading Terminal",
    description: "Use the NexaX professional trading terminal with live charts, market depth, recent trades, funding data, and spot or perpetual order controls.",
    path: "/trade",
    keywords: ["crypto trading terminal", "live order book", "crypto charts", "perpetual trading"],
});

export default function TradeLayout({ children }: Readonly<{ children: ReactNode }>) {
    return children;
}
