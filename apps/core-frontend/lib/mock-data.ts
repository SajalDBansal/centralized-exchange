// Mock data for NexaX exchange. All in-memory, no backend.

export type MarketType = "spot" | "perp";
export type Sector = "Layer 1" | "Meme" | "AI" | "DeFi" | "RWA" | "Gaming" | "Infra";

export interface Market {
    symbol: string;
    base: string;
    quote: string;
    type: MarketType;
    price: number;
    change24h: number; // percent
    high24h: number;
    low24h: number;
    volume24h: number; // in quote
    fundingRate?: number;
    openInterest?: number;
    markPrice?: number;
    indexPrice?: number;
    sector: Sector;
    isNew?: boolean;
    icon: string; // emoji or letter
}

const seed = (base: number, dev: number) => base * (1 + (Math.random() - 0.5) * dev);

export const MARKETS: Market[] = [
    { symbol: "BTC/USDT", base: "BTC", quote: "USDT", type: "spot", price: 67432.15, change24h: 2.34, high24h: 68210.5, low24h: 65980.2, volume24h: 1842300000, sector: "Layer 1", icon: "₿" },
];

export const TICKER_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT", "BTC-PERP", "ETH-PERP", "SOL-PERP"];

// Generate candlestick OHLC
export interface Candle {
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
}

export function generateCandles(basePrice: number, count = 80): Candle[] {
    const out: Candle[] = [];
    let p = basePrice * 0.97;
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        const o = p;
        const change = (Math.random() - 0.48) * basePrice * 0.012;
        const c = Math.max(0.0000001, o + change);
        const h = Math.max(o, c) + Math.random() * basePrice * 0.006;
        const l = Math.min(o, c) - Math.random() * basePrice * 0.006;
        out.push({ t: now - (count - i) * 60000, o, h, l, c, v: Math.random() * 1000 });
        p = c;
    }
    return out;
}

export interface OrderBookRow { price: number; size: number; total: number; }

export function generateOrderBook(midPrice: number, rows = 15): { bids: OrderBookRow[]; asks: OrderBookRow[] } {
    const tick = midPrice * 0.0002;
    const bids: OrderBookRow[] = [];
    const asks: OrderBookRow[] = [];
    let bidTotal = 0, askTotal = 0;
    for (let i = 1; i <= rows; i++) {
        const bSize = Math.random() * 3 + 0.05;
        const aSize = Math.random() * 3 + 0.05;
        bidTotal += bSize;
        askTotal += aSize;
        bids.push({ price: midPrice - tick * i, size: bSize, total: bidTotal });
        asks.push({ price: midPrice + tick * i, size: aSize, total: askTotal });
    }
    return { bids, asks };
}

export interface Trade { id: string; price: number; size: number; side: "buy" | "sell"; time: string; }
export function generateRecentTrades(midPrice: number, count = 25): Trade[] {
    const out: Trade[] = [];
    const tick = midPrice * 0.0002;
    for (let i = 0; i < count; i++) {
        const d = new Date(Date.now() - i * 7000);
        out.push({
            id: `t${i}`,
            price: midPrice + (Math.random() - 0.5) * tick * 4,
            size: Math.random() * 2 + 0.01,
            side: Math.random() > 0.5 ? "buy" : "sell",
            time: d.toLocaleTimeString("en-US", { hour12: false }),
        });
    }
    return out;
}

export interface OpenOrder { id: string; time: string; market: string; side: "buy" | "sell"; type: string; price: number; amount: number; filled: number; status: string; }
export const OPEN_ORDERS: OpenOrder[] = [
    { id: "o1", time: "2026-06-25 10:14:22", market: "BTC/USDT", side: "buy", type: "Limit", price: 66800, amount: 0.05, filled: 0, status: "Open" },
    { id: "o2", time: "2026-06-25 09:42:11", market: "ETH/USDT", side: "sell", type: "Limit", price: 3580, amount: 1.2, filled: 0.4, status: "Partial" },
    { id: "o3", time: "2026-06-25 08:21:45", market: "SOL-PERP", side: "buy", type: "Stop Limit", price: 175, amount: 8, filled: 0, status: "Open" },
];

export interface Position { id: string; market: string; side: "long" | "short"; size: number; entryPrice: number; markPrice: number; liqPrice: number; margin: number; leverage: number; pnl: number; roe: number; status: "open" | "closed"; }
export const POSITIONS: Position[] = [
    { id: "p1", market: "BTC-PERP", side: "long", size: 0.25, entryPrice: 66200, markPrice: 67442, liqPrice: 58100, margin: 1655, leverage: 10, pnl: 310.5, roe: 18.75, status: "open" },
    { id: "p2", market: "ETH-PERP", side: "short", size: 4.5, entryPrice: 3560, markPrice: 3521.9, liqPrice: 3820, margin: 800, leverage: 20, pnl: 171.45, roe: 21.43, status: "open" },
    { id: "p3", market: "SOL-PERP", side: "long", size: 50, entryPrice: 168.4, markPrice: 178.55, liqPrice: 142.1, margin: 842, leverage: 10, pnl: 507.5, roe: 60.27, status: "open" },
    { id: "p4", market: "DOGE-PERP", side: "long", size: 12000, entryPrice: 0.135, markPrice: 0.1433, liqPrice: 0.108, margin: 162, leverage: 10, pnl: 99.6, roe: 61.48, status: "closed" },
    { id: "p5", market: "WIF-PERP", side: "short", size: 200, entryPrice: 2.42, markPrice: 2.349, liqPrice: 2.91, margin: 96.8, leverage: 5, pnl: 14.2, roe: 14.67, status: "closed" },
];

export interface TradeHistoryRow { id: string; time: string; market: string; side: "buy" | "sell"; price: number; amount: number; fee: number; }
export const TRADE_HISTORY: TradeHistoryRow[] = [
    { id: "th1", time: "2026-06-25 09:12:01", market: "BTC/USDT", side: "buy", price: 66100, amount: 0.1, fee: 6.61 },
    { id: "th2", time: "2026-06-24 22:42:18", market: "ETH/USDT", side: "sell", price: 3490, amount: 2, fee: 6.98 },
    { id: "th3", time: "2026-06-24 18:01:42", market: "SOL-PERP", side: "buy", price: 168.4, amount: 50, fee: 4.21 },
    { id: "th4", time: "2026-06-24 12:14:55", market: "WIF/USDT", side: "buy", price: 2.08, amount: 100, fee: 0.21 },
];

export interface OrderHistoryRow extends OpenOrder { }
export const ORDER_HISTORY: OrderHistoryRow[] = [
    { id: "h1", time: "2026-06-24 21:14:22", market: "BTC/USDT", side: "buy", type: "Market", price: 66100, amount: 0.1, filled: 0.1, status: "Filled" },
    { id: "h2", time: "2026-06-24 18:02:14", market: "SOL-PERP", side: "buy", type: "Limit", price: 168.4, amount: 50, filled: 50, status: "Filled" },
    { id: "h3", time: "2026-06-23 11:32:08", market: "ARB/USDT", side: "sell", type: "Limit", price: 0.91, amount: 500, filled: 0, status: "Cancelled" },
];

export interface FundingRow { id: string; time: string; market: string; rate: number; payment: number; }
export const FUNDING_HISTORY: FundingRow[] = [
    { id: "f1", time: "2026-06-25 08:00:00", market: "BTC-PERP", rate: 0.0102, payment: -1.71 },
    { id: "f2", time: "2026-06-25 00:00:00", market: "ETH-PERP", rate: 0.0089, payment: 1.42 },
    { id: "f3", time: "2026-06-24 16:00:00", market: "SOL-PERP", rate: 0.0152, payment: -1.36 },
];

export interface Balance { asset: string; icon: string; total: number; available: number; inOrders: number; usdPrice: number; change24h: number; }
export const BALANCES: Balance[] = [
    { asset: "USDT", icon: "₮", total: 12450.32, available: 10250.32, inOrders: 2200, usdPrice: 1, change24h: 0 },
    { asset: "USDC", icon: "$", total: 3500, available: 3500, inOrders: 0, usdPrice: 1, change24h: 0 },
    { asset: "BTC", icon: "₿", total: 0.4821, available: 0.4321, inOrders: 0.05, usdPrice: 67432.15, change24h: 2.34 },
    { asset: "ETH", icon: "Ξ", total: 6.214, available: 5.014, inOrders: 1.2, usdPrice: 3521.88, change24h: 1.12 },
    { asset: "SOL", icon: "◎", total: 85.4, available: 85.4, inOrders: 0, usdPrice: 178.42, change24h: 4.85 },
    { asset: "BNB", icon: "B", total: 12.5, available: 12.5, inOrders: 0, usdPrice: 612.5, change24h: -0.72 },
    { asset: "XRP", icon: "X", total: 2500, available: 2500, inOrders: 0, usdPrice: 0.5421, change24h: -1.34 },
    { asset: "DOGE", icon: "Ɖ", total: 18500, available: 18500, inOrders: 0, usdPrice: 0.1432, change24h: 6.21 },
    { asset: "AVAX", icon: "A", total: 42, available: 42, inOrders: 0, usdPrice: 38.74, change24h: 3.45 },
    { asset: "LINK", icon: "L", total: 120, available: 120, inOrders: 0, usdPrice: 14.82, change24h: 0.94 },
];

export interface WalletTx { id: string; type: "Deposit" | "Withdrawal" | "Transfer" | "Trade Fee" | "Funding Fee"; asset: string; amount: number; status: "Completed" | "Pending"; time: string; tx: string; }
export const WALLET_TX: WalletTx[] = [
    { id: "w1", type: "Deposit", asset: "USDT", amount: 5000, status: "Completed", time: "2026-06-24 14:22:01", tx: "0x8f2a…c41b" },
    { id: "w2", type: "Trade Fee", asset: "USDT", amount: -6.61, status: "Completed", time: "2026-06-25 09:12:01", tx: "—" },
    { id: "w3", type: "Withdrawal", asset: "BTC", amount: -0.1, status: "Completed", time: "2026-06-22 11:42:18", tx: "0x42de…91aa" },
    { id: "w4", type: "Transfer", asset: "ETH", amount: 1.5, status: "Completed", time: "2026-06-22 09:01:55", tx: "—" },
    { id: "w5", type: "Funding Fee", asset: "USDT", amount: -1.71, status: "Completed", time: "2026-06-25 08:00:00", tx: "—" },
    { id: "w6", type: "Deposit", asset: "ETH", amount: 2, status: "Pending", time: "2026-06-25 10:01:11", tx: "0x71be…42c8" },
];

export const SECTORS: Sector[] = ["Layer 1", "Meme", "AI", "DeFi", "RWA", "Gaming", "Infra"];

// Silence unused
void seed;
