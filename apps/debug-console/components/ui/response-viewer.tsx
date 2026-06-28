"use client";

import { useCallback, useState } from "react";
import { apiPath, apiRequest, ApiClientError, type ApiRequestOptions } from "@/lib/api-client";
import { log } from "@/lib/debug-bus";
import { formatIstTimeWithMilliseconds } from "@/lib/time";
import { Panel } from "./shell";

export interface ResponseEntry {
    ts: string;
    method: string;
    path: string;
    status: number;
    latency_ms: number;
    request: unknown;
    response: unknown;
}

const MAX_RESPONSE_HISTORY = 50;

export function useResponseCapture() {
    const [last, setLast] = useState<ResponseEntry | null>(null);
    const [history, setHistory] = useState<ResponseEntry[]>([]);

    const record = useCallback((entry: ResponseEntry) => {
        setLast(entry);
        setHistory((current) => [entry, ...current].slice(0, MAX_RESPONSE_HISTORY));
    }, []);

    const capture = useCallback(async function capture<T>(
        scope: string,
        method: string,
        path: string,
        payload: unknown,
        options?: ApiRequestOptions & { displayRequest?: unknown },
    ): Promise<T> {
        const request = options?.displayRequest ?? payload ?? null;
        const displayPath = apiPath(path);
        log("REQ", scope, `${method} ${displayPath} ${summarizeRequest(request)}`);

        try {
            const result = await apiRequest<T>(method, path, payload, options);
            record({
                ts: formatIstTimeWithMilliseconds(),
                method,
                path: displayPath,
                status: result.status,
                latency_ms: result.latencyMs,
                request,
                response: result.data,
            });
            log("RES", scope, `${method} ${displayPath} ${result.status} ${result.latencyMs}ms ${summarizeResponse(result.data)}`);
            return result.data;
        } catch (err) {
            const apiError = err instanceof ApiClientError
                ? err
                : new ApiClientError(String(err), 500, { message: String(err) });
            record({
                ts: formatIstTimeWithMilliseconds(),
                method,
                path: displayPath,
                status: apiError.status,
                latency_ms: apiError.latencyMs,
                request,
                response: apiError.body,
            });
            log("ERROR", scope, `${method} ${displayPath} ${apiError.status || "NETWORK"} ${summarizeResponse(apiError.body, apiError.message)}`);
            throw err;
        }
    }, [record]);

    const recordError = useCallback((method: string, path: string, request: unknown, response: unknown, status = 400) => {
        record({
            ts: formatIstTimeWithMilliseconds(),
            method,
            path: apiPath(path),
            status,
            latency_ms: 0,
            request,
            response,
        });
    }, [record]);

    const clearHistory = useCallback(() => {
        setLast(null);
        setHistory([]);
    }, []);

    return { last, history, capture, recordError, clearHistory };
}

export function ResponseViewer({ data }: { data: ResponseEntry | readonly ResponseEntry[] | null }) {
    const entries = Array.isArray(data) ? data : data ? [data] : [];

    if (entries.length === 0) {
        return <div className="p-3 text-[12px] text-term-dim">{"// no requests captured yet — trigger an action to populate"}</div>;
    }

    return (
        <div className="h-full min-h-0 overflow-auto text-[12px]">
            {entries.map((entry, index) => {
                const ok = entry.status >= 200 && entry.status < 300;
                return (
                    <section key={`${entry.ts}-${entry.method}-${entry.path}-${index}`} className="border-b border-border">
                        <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 bg-secondary px-2 py-1 text-[11px]">
                            <span className="text-term-dim">#{entries.length - index}</span>
                            <span className="min-w-0 truncate">
                                <span className={methodColor(entry.method)}>{entry.method}</span>{" "}
                                <span className="text-foreground">{entry.path}</span>
                            </span>
                            <span className={ok ? "text-term-green" : "text-term-red"}>{entry.status || "NETWORK"} {ok ? "OK" : "ERR"}</span>
                            <span className="col-start-2 text-term-dim">IST {entry.ts}</span>
                            <span className="text-right text-term-yellow">{entry.latency_ms}ms</span>
                        </div>
                        <div className="grid gap-2 px-2 py-1 lg:grid-cols-2">
                            <div className="min-w-0">
                                <div className="text-term-dim">{"// request"}</div>
                                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-term-cyan">{JSON.stringify(entry.request, null, 2)}</pre>
                            </div>
                            <div className="min-w-0">
                                <div className="text-term-dim">{"// response"}</div>
                                <pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-all ${ok ? "text-term-green" : "text-term-red"}`}>{JSON.stringify(entry.response, null, 2)}</pre>
                            </div>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

export function ResponsePanel({ data, title = "response.history" }: { data: ResponseEntry | readonly ResponseEntry[] | null; title?: string }) {
    return <Panel title={title}><ResponseViewer data={data} /></Panel>;
}

function summarizeRequest(value: unknown) {
    if (value === null || value === undefined) return "body=none";
    if (Array.isArray(value)) return `body=array items=${value.length}`;
    if (typeof value !== "object") return `body=${typeof value}`;

    const body = value as Record<string, unknown>;
    const fields = Object.keys(body);
    const details = safeDetails(body, ["marketId", "orderId", "assetId", "side", "type", "quantity", "amount"]);
    return `fields=[${fields.join(",")}]${details ? ` ${details}` : ""}`;
}

function summarizeResponse(value: unknown, fallbackMessage?: string) {
    if (value === null || value === undefined) return fallbackMessage ? `message=${shorten(fallbackMessage)}` : "body=none";
    if (Array.isArray(value)) return `body=array items=${value.length}`;
    if (typeof value !== "object") return `body=${typeof value}`;

    const body = value as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof body.success === "boolean") parts.push(`success=${body.success}`);
    if (typeof body.message === "string") parts.push(`message=${shorten(body.message)}`);
    else if (fallbackMessage) parts.push(`message=${shorten(fallbackMessage)}`);
    if (typeof body.code === "string") parts.push(`code=${body.code}`);
    if (typeof body.type === "string") parts.push(`type=${body.type}`);

    const order = findOrderSummary(body);
    if (order) parts.push(order);
    if (parts.length === 0) parts.push(`fields=[${Object.keys(body).join(",")}]`);
    return parts.join(" ");
}

function safeDetails(body: Record<string, unknown>, keys: string[]) {
    return keys
        .filter((key) => typeof body[key] === "string" || typeof body[key] === "number" || typeof body[key] === "boolean")
        .map((key) => `${key}=${shorten(String(body[key]))}`)
        .join(" ");
}

function findOrderSummary(body: Record<string, unknown>) {
    const orderEnvelope = isRecord(body.order) ? body.order : undefined;
    const data = orderEnvelope && isRecord(orderEnvelope.data) ? orderEnvelope.data : isRecord(body.data) ? body.data : undefined;
    const order = data && isRecord(data.order) ? data.order : orderEnvelope;
    if (!order) return "";

    const details = safeDetails(order, ["orderId", "status", "marketId", "side"]);
    return details ? `order(${details})` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function shorten(value: string, maxLength = 100) {
    const singleLine = value.replace(/\s+/g, " ").trim();
    return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine;
}

function methodColor(method: string) {
    switch (method.toUpperCase()) {
        case "GET":
            return "text-term-cyan";
        case "POST":
            return "text-term-green";
        case "PUT":
        case "PATCH":
            return "text-term-yellow";
        case "DELETE":
            return "text-term-red";
        case "OPTIONS":
            return "text-term-magenta";
        default:
            return "text-term-dim";
    }
}
