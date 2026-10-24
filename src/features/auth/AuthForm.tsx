"use client";

import React, { useState } from "react";
import Link from "next/link";

type Mode = "login" | "register";

const COPY: Record<Mode, { title: string; action: string; busy: string; switchText: string; switchHref: string; switchLabel: string }> = {
  login: { title: "Welcome back", action: "Log in", busy: "Logging in…", switchText: "New to Roomify?", switchHref: "/register", switchLabel: "Create an account" },
  register: { title: "Create your account", action: "Create account", busy: "Creating account…", switchText: "Already have an account?", switchHref: "/login", switchLabel: "Log in" },
};

/** Same-site absolute paths only, mirroring the server-side rule. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
  return value;
}

export function AuthForm({ mode, next }: { mode: Mode; next: string | null }) {
  const copy = COPY[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "register" && password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "register" ? { email, password, displayName } : { email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || "Something went wrong. Try again.");
        return;
      }
      window.location.assign(safeNext(next));
    } catch {
      setError("Room service unavailable. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const input = "mt-1 block w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <Link href="/" className="text-lg font-semibold tracking-tight text-gray-900">Roomify</Link>
        <h1 className="mt-6 text-2xl font-semibold text-gray-900">{copy.title}</h1>
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
          {mode === "register" && (
            <label className="block text-sm font-medium text-gray-700">Name <span className="font-normal text-gray-500">(optional)</span>
              <input className={input} value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" maxLength={100} />
            </label>
          )}
          <label className="block text-sm font-medium text-gray-700">Email
            <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="block text-sm font-medium text-gray-700">Password
            <input className={input} type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 8 : undefined} maxLength={72} required />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60">
            {submitting ? copy.busy : copy.action}
          </button>
        </form>
        <p className="mt-6 text-sm text-gray-600">{copy.switchText}{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-500" href={next ? `${copy.switchHref}?next=${encodeURIComponent(next)}` : copy.switchHref}>{copy.switchLabel}</Link>
        </p>
      </div>
    </main>
  );
}
