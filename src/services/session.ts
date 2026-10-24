/** Browser-side session helpers. The session token itself lives in an httpOnly cookie. */
export interface SessionUser {
  id: number;
  email: string;
  displayName: string | null;
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  if (typeof window !== "undefined") window.location.assign("/login");
}

export async function getCurrentUser(signal?: AbortSignal): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store", signal });
  if (!response.ok) return null;
  return (await response.json()) as SessionUser;
}
