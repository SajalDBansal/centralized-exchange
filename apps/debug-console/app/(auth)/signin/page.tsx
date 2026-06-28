"use client";
import { useEffect, useState } from "react";
import { log } from "@/lib/debug-bus";
import { ResponsePanel, useResponseCapture } from "@/components/ui/response-viewer";
import { Panel, Shell } from "@/components/ui/shell";
import Terminal from "@/components/ui/terminal";
import { clearAuthSession, getAuthSession, saveAuthSession, type AuthSession } from "@/lib/api-client";

export default function SignIn() {
    const [username, setUsername] = useState("");
    const [pw, setPw] = useState("");
    const [busy, setBusy] = useState(false);
    const [storedUsername, setStoredUsername] = useState<string | null>(null);
    const { history, capture, recordError } = useResponseCapture();

    useEffect(() => {
        const timer = window.setTimeout(() => setStoredUsername(getAuthSession()?.user.username ?? null), 0);
        return () => window.clearTimeout(timer);
    }, []);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        log("INFO", "auth.signin", `form submit username=${username}`);
        log("DEBUG", "auth.signin", `client.validate -> password.${pw.length >= 6 ? "ok" : "too_short"}`);
        if (pw.length < 6) {
            log("ERROR", "auth.signin", "validation failed: password.min_length");
            recordError("POST", "/auth/signin", { username, password: "***" }, {
                error: "password.min_length",
                message: "password must be >= 6 chars",
            });
            setBusy(false);
            return;
        }
        try {
            const res = await capture<AuthSession & { success: boolean; message: string }>(
                "auth.signin",
                "POST",
                "/auth/signin",
                { username, password: pw },
                { auth: "none", displayRequest: { username, password: "***" } },
            );
            saveAuthSession({ token: res.token, user: res.user });
            setStoredUsername(res.user.username);
            log("OK", "auth.session", `access token stored for user_id=${res.user.id}`);
            log("DEBUG", "auth.session", "refresh token accepted as an httpOnly cookie");
            log("INFO", "router", "authenticated routes /wallet and /trade are ready");
        } catch {
            // The response panel and terminal already contain the API error.
        } finally {
            setBusy(false);
        }
    }

    return (
        <Shell title="signin">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1fr_1fr_1fr]">
                <Panel title="auth.signin">
                    <form onSubmit={submit} className="space-y-3 p-4 text-[12px]">
                        <Field label="username">
                            <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
                        </Field>
                        <Field label="password">
                            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
                        </Field>
                        <div className="flex items-center gap-2 pt-2">
                            <button disabled={busy} className={btnCls}>
                                {busy ? "exchanging..." : "$ ./signin"}
                            </button>
                            <span className="text-term-dim">POST /api/v1/auth/signin</span>
                        </div>
                        <pre className="mt-4 border border-border bg-secondary p-2 text-term-dim">{`// payload
{
  "username": ${JSON.stringify(username)},
  "password": "${"*".repeat(pw.length)}"
}`}</pre>
                        <div className="flex items-center justify-between border-t border-border pt-2 text-term-dim">
                            <span>{storedUsername ? `stored session: ${storedUsername}` : "stored session: none"}</span>
                            <button
                                type="button"
                                className="hover:text-term-yellow"
                                onClick={() => {
                                    clearAuthSession();
                                    setStoredUsername(null);
                                    log("INFO", "auth.session", "local access token cleared");
                                }}
                            >
                                [clear token]
                            </button>
                        </div>
                    </form>
                </Panel>
                <ResponsePanel data={history} title={`auth.request_history · ${history.length} calls`} />
                <Terminal title="stdout · auth.signin" />
            </main>
        </Shell>
    );
}

const inputCls =
    "w-full border border-border bg-input px-2 py-1 font-mono text-foreground outline-none focus:border-term-green";
const btnCls =
    "border border-term-green bg-secondary px-3 py-1 text-term-green hover:bg-term-green hover:text-background disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="mb-1 text-term-dim">{label}</div>
            {children}
        </label>
    );
}
