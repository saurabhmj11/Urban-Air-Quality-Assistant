/**
 * Next.js server startup hook.
 *
 * Node >= 23 ships with autoSelectFamily (Happy Eyeballs) disabled by
 * default, which makes global fetch prefer AAAA records. This sandbox (like
 * many container environments) has no IPv6 route, so outbound HTTPS to
 * dual-stack hosts (e.g. Open-Meteo) times out with ETIMEDOUT. Re-enabling
 * autoSelectFamily lets fetch race IPv6/IPv4 and fall back to IPv4, matching
 * curl/browser behaviour.
 *
 * The default 250ms per-address attempt timeout is also too aggressive for
 * hosts whose TCP handshake is slow (observed on Open-Meteo after a network
 * change: a plain net.connect succeeds while fetch gives up mid-handshake
 * with ETIMEDOUT). Raising it to 3s keeps Happy Eyeballs but tolerates the
 * slower handshake.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const net = await import("node:net");
    if (typeof net.setDefaultAutoSelectFamily === "function") {
      net.setDefaultAutoSelectFamily(true);
    }
    if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function") {
      net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
    }
  }
}
