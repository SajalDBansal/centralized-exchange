import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
    title: "Crypto Markets",
    description: "Track live spot and perpetual crypto prices, 24-hour performance, volume, funding rates, and open interest across NexaX markets.",
    path: "/markets",
    keywords: ["live crypto prices", "crypto market data", "top crypto gainers", "perpetual funding rates"],
});

export default function MarketsLayout({ children }: Readonly<{ children: ReactNode }>) {
    return children;
}
