type DecimalParts = {
    value: bigint;
    scale: number;
};

export function addDecimalStrings(left: string, right: string) {
    const [a, b] = normalizeScales(parseDecimalString(left), parseDecimalString(right));

    return formatDecimal(a.value + b.value, a.scale);
}

export function subtractDecimalStrings(left: string, right: string) {
    const [a, b] = normalizeScales(parseDecimalString(left), parseDecimalString(right));

    return formatDecimal(a.value - b.value, a.scale);
}

export function multiplyDecimalStrings(left: string, right: string) {
    const a = parseDecimalString(left);
    const b = parseDecimalString(right);

    return formatDecimal(a.value * b.value, a.scale + b.scale);
}

export function compareDecimalStrings(left: string, right: string) {
    const [a, b] = normalizeScales(parseDecimalString(left), parseDecimalString(right));

    if (a.value === b.value) {
        return 0;
    }

    return a.value > b.value ? 1 : -1;
}

export function isZeroDecimalString(value: string) {
    return parseDecimalString(value).value === 0n;
}

function parseDecimalString(value: string): DecimalParts {
    const normalized = value.trim();
    const negative = normalized.startsWith("-");
    const unsigned = negative ? normalized.slice(1) : normalized;
    const [integerPart = "0", decimalPart = ""] = unsigned.split(".");
    const safeIntegerPart = integerPart === "" ? "0" : integerPart;
    const digits = `${safeIntegerPart}${decimalPart}`.replace(/^0+(?=\d)/, "");

    if (!/^\d+$/.test(digits)) {
        throw new Error(`Invalid decimal string: ${value}`);
    }

    return {
        value: BigInt(`${negative ? "-" : ""}${digits}`),
        scale: decimalPart.length,
    };
}

function normalizeScales(left: DecimalParts, right: DecimalParts): [DecimalParts, DecimalParts] {
    if (left.scale === right.scale) {
        return [left, right];
    }

    const scale = Math.max(left.scale, right.scale);

    return [
        { value: rescale(left, scale), scale },
        { value: rescale(right, scale), scale },
    ];
}

function rescale(decimal: DecimalParts, scale: number) {
    return decimal.value * 10n ** BigInt(scale - decimal.scale);
}

function formatDecimal(value: bigint, scale: number) {
    const negative = value < 0n;
    const absolute = negative ? -value : value;

    if (scale === 0) {
        return `${negative ? "-" : ""}${absolute.toString()}`;
    }

    const digits = absolute.toString().padStart(scale + 1, "0");
    const integerPart = digits.slice(0, -scale);
    const decimalPart = digits.slice(-scale).replace(/0+$/, "");

    return `${negative ? "-" : ""}${integerPart}${decimalPart ? `.${decimalPart}` : ""}`;
}
