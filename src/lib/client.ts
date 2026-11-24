/**
 * Shared JSON fetch helpers (client-side).
 *
 * Every tab used to hand-roll the same 8-line cycle — fetch with headers,
 * res.json(), `if (!res.ok) throw` with the server's error field, then map
 * unknown throwables to a friendly message. These helpers collapse that
 * to one typed call: the thrown Error always carries the server's
 * human-readable message (routes are careful to produce one), and
 * `userMessage` turns any rejection into display-safe text.
 */

/** Shape of the error envelope every API route returns. */
interface ErrorEnvelope {
  error?: string;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorEnvelope;
    if (typeof body.error === "string" && body.error.length > 0) return body.error;
  } catch {
    /* body was not JSON — fall through to the status text */
  }
  return `Request failed (${res.status})`;
}

/** POST JSON and return the parsed body as T; throws Error with the server message on failure. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network failure / request never reached the server.
    throw err instanceof Error ? err : new Error("Network error");
  }
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

/** GET JSON and return the parsed body as T; throws Error with the server message on failure. */
export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

/** DELETE a resource; throws Error with the server message on failure. */
export async function deleteJson(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

/**
 * Map a caught value to a message safe to show the user: known Errors keep
 * their message (already human-readable), anything else gets the fallback.
 */
export function userMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
