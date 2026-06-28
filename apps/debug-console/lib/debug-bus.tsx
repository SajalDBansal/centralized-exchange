import { useEffect, useState } from "react";
import { formatIstTimeWithMilliseconds } from "@/lib/time";

export type LogLevel = "INFO" | "DEBUG" | "WARN" | "ERROR" | "OK" | "WS" | "REQ" | "RES";

export interface LogEntry {
    id: number;
    ts: string;
    level: LogLevel;
    scope: string;
    msg: string;
}

const MAX = 500;
let counter = 0;
const subs = new Set<(logs: LogEntry[]) => void>();
let buffer: LogEntry[] = [];

function ts() {
    return formatIstTimeWithMilliseconds();
}

export function log(level: LogLevel, scope: string, msg: string) {
    const entry: LogEntry = { id: ++counter, ts: ts(), level, scope, msg };
    buffer = [...buffer, entry].slice(-MAX);
    subs.forEach((fn) => fn(buffer));
}

export function clearLogs() {
    buffer = [];
    subs.forEach((fn) => fn(buffer));
}

export function useLogs() {
    const [logs, setLogs] = useState<LogEntry[]>(buffer);
    useEffect(() => {
        subs.add(setLogs);
        return () => {
            subs.delete(setLogs);
        };
    }, []);
    return logs;
}
