/**
 * Next.js server startup hook.
 *
 * Node >= 23 ships with autoSelectFamily (Happy Eyeballs) disabled by
 * default, which makes global fetch prefer AAAA records. This sandbox (like
 * many container environments) has no IPv6 route, so outbound HTTPS to
 * dual-stack hosts (e.g. Open-Meteo) times out with ETIMEDOUT. Re-enabling
 * autoSelectFamily lets fetch race IPv6/IPv4 and fall back to IPv4, matching
 * curl/browser behaviour.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const net = await import("node:net");
    if (typeof net.setDefaultAutoSelectFamily === "function") {
      net.setDefaultAutoSelectFamily(true);
    }
  }
}
