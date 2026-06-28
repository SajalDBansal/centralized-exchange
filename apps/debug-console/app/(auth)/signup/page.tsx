"use client";
import { useState } from "react";
import { log } from "@/lib/debug-bus";
import { Panel, Shell } from "@/components/ui/shell";
import Terminal from "@/components/ui/terminal";
import { ResponsePanel, useResponseCapture } from "@/components/ui/response-viewer"

export default function SignUp() {
    const [email, setEmail] = useState("");
    const [user, setUser] = useState("");
    const [pw, setPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [busy, setBusy] = useState(false);
    const { history, capture, recordError } = useResponseCapture();

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        log("INFO", "auth.signup", `form submit email=${email} username=${user}`);
        const checks = {
            email: /.+@.+\..+/.test(email),
            username: user.length >= 3,
            password: pw.length >= 8,
            confirmPassword: pw === confirmPw,
        };
        Object.entries(checks).forEach(([k, v]) =>
            log(v ? "OK" : "ERROR", "auth.validate", `${k}.${v ? "valid" : "invalid"}`),
        );
        if (!Object.values(checks).every(Boolean)) {
            log("ERROR", "auth.signup", "abort: validation failed");
            recordError(
                "POST",
                "/auth/signup",
                { email, username: user, password: "***", confirmPassword: "***" },
                { error: "validation_failed", checks },
            );
            setBusy(false);
            return;
        }
        try {
            const res = await capture<{ success: boolean; message: string }>(
                "auth.signup",
                "POST",
                "/auth/signup",
                { email, username: user, password: pw, confirmPassword: confirmPw },
                {
                    auth: "none",
                    displayRequest: { email, username: user, password: "***", confirmPassword: "***" },
                },
            );
            log("OK", "auth.signup", res.message);
            log("INFO", "auth.signup", "account is ready; continue to /signin");
        } catch {
            // The response panel and terminal already contain the API error.
        } finally {
            setBusy(false);
        }
    }

    return (
        <Shell title="signup">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1fr_1fr_1fr]">
                <Panel title="auth.signup">
                    <form onSubmit={submit} className="space-y-3 p-4 text-[12px]">
                        <Field label="email">
                            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                        </Field>
                        <Field label="username">
                            <input value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} />
                        </Field>
                        <Field label="password (>= 8 chars)">
                            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
                        </Field>
                        <Field label="confirm password">
                            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} />
                        </Field>
                        <div className="flex items-center gap-2 pt-2">
                            <button disabled={busy} className={btnCls}>
                                {busy ? "submitting..." : "$ ./register"}
                            </button>
                            <span className="text-term-dim">POST /api/v1/auth/signup</span>
                        </div>
                    </form>
                </Panel>
                <ResponsePanel data={history} title={`auth.request_history · ${history.length} calls`} />
                <Terminal title="stdout · auth.signup" />
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
