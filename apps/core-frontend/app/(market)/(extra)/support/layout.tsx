import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
    title: "Support",
    description: "Find answers about NexaX accounts, deposits, withdrawals, trading, fees, security, and API access or contact support.",
    path: "/support",
    keywords: ["NexaX support", "crypto exchange help", "trading support", "account help"],
});

export default function SupportLayout({ children }: Readonly<{ children: ReactNode }>) {
    return children;
}
