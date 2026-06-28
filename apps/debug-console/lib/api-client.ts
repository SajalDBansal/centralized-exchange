export const CORE_API_URL = (
    process.env.NEXT_PUBLIC_CORE_BACKEND_URL ?? "http://localhost:8080/api/v1"
).replace(/\/$/, "");

const AUTH_STORAGE_KEY = "cex.debug.auth";
export const AUTH_CHANGED_EVENT = "cex-debug-auth-changed";

export type AuthSession = {
    token: string;
    user: {
        id: string;
        username: string;
        email: string;
    };
};

export type ApiRequestOptions = {
    auth?: "none" | "optional" | "required";
    signal?: AbortSignal;
};

export type ApiResult<T> = {
    data: T;
    status: number;
    latencyMs: number;
};

export class ApiClientError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly body: unknown,
        public readonly latencyMs = 0,
    ) {
        super(message);
        this.name = "ApiClientError";
    }
}

export function apiPath(path: string) {
    return `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
    const authMode = options.auth ?? "optional";
    const session = getAuthSession();

    if (authMode === "required" && !session?.token) {
        throw new ApiClientError("Sign in before calling this route", 401, {
            success: false,
            type: "TOKEN_UNAVAILABLE",
            message: "No debug-console access token is stored. Sign in first.",
        });
    }

    const startedAt = performance.now();
    let response: Response;

    try {
        response = await fetch(`${CORE_API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
            method,
            credentials: "include",
            signal: options.signal,
            headers: {
                Accept: "application/json",
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                ...(authMode !== "none" && session?.token
                    ? { Authorization: session.token }
                    : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (error) {
        const latencyMs = Math.round(performance.now() - startedAt);
        throw new ApiClientError(
            error instanceof Error ? error.message : "Network request failed",
            0,
            {
                success: false,
                type: "NETWORK_ERROR",
                message: error instanceof Error ? error.message : String(error),
                backend: CORE_API_URL,
            },
            latencyMs,
        );
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    const data = await parseResponse(response);

    if (!response.ok) {
        const message = readMessage(data) ?? `${response.status} ${response.statusText}`;
        throw new ApiClientError(message, response.status, data, latencyMs);
    }

    return { data: data as T, status: response.status, latencyMs };
}

export function saveAuthSession(session: AuthSession) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthSession() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getAuthSession(): AuthSession | null {
    if (typeof window === "undefined") return null;

    try {
        const value = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (!value) return null;
        const parsed = JSON.parse(value) as Partial<AuthSession>;
        if (typeof parsed.token !== "string" || !parsed.user?.id) return null;
        return parsed as AuthSession;
    } catch {
        return null;
    }
}

async function parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function readMessage(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
}
