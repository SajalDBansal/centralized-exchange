import { Footer } from "@/components/layout/market-footer";
import { Navbar } from "@/components/layout/market-header";
import { TickerStrip } from "@/components/layout/market-tickerStrip";

export default function MarketLayout({ children, }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <TickerStrip />
            <main className="flex-1">
                {children}
            </main>
            <Footer />
        </div>
    )
}