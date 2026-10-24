export async function checkBackendHealth(
  signal?: AbortSignal
): Promise<{ status: string }> {
  const response = await fetch("/api/health", { credentials: "omit", signal });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json();
}
