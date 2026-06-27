export function fmtPrice(n: number, digits?: number): string {
    if (n === 0) return "0.00";
    const d = digits ?? (n >= 1000 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 8);
    return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtUsd(n: number, digits = 2): string {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtCompact(n: number): string {
    if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(2) + "K";
    return "$" + n.toFixed(2);
}

export function fmtPct(n: number, withSign = true): string {
    const s = withSign && n >= 0 ? "+" : "";
    return s + n.toFixed(2) + "%";
}

export function fmtAmount(n: number, digits = 4): string {
    return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
