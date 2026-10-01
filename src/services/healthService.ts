export async function checkBackendHealth(
  signal?: AbortSignal
): Promise<{ status: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const response = await fetch(`${baseUrl}/health`, { credentials: "omit", signal });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json();
}
