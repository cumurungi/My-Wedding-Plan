export async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}). Restart or redeploy the API server, then try again.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}). Restart or redeploy the API server, then try again.`);
  }
  const result = data as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof result.error === 'string' ? result.error : `The request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return data as T;
}
