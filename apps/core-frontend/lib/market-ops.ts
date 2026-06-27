import { TickerB } from "@workspace/types";

export const symbolParts = (symbol: string) => {
    const [base = symbol, quote = "", suffix] = symbol.split("_");
    return { base, quote, display: suffix === "PERP" ? `${base}-${quote}` : `${base}/${quote}` };
};

export const isPerp = (ticker: TickerB) => ticker.symbol.endsWith("_PERP");