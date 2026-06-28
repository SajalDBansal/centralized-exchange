export const IST_TIME_ZONE = "Asia/Kolkata";
export const IST_LABEL = "IST (UTC+05:30)";

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

const clockWithMillisecondsFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
});

const minuteFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

export function formatIstTime(value: Date | number = Date.now()) {
    return clockFormatter.format(value);
}

export function formatIstTimeWithMilliseconds(value: Date | number = Date.now()) {
    return clockWithMillisecondsFormatter.format(value);
}

export function formatIstMinute(value: Date | number) {
    return minuteFormatter.format(value);
}
