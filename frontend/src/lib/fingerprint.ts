/**
 * A stable, non-identifying hash of browser traits, sent with code checks so the backend can count attempts per
 * device as well as per IP. It is a signal, not proof: anyone can forge it, which is why the email counter exists too.
 */
let cached: Promise<string> | null = null

export function getFingerprint(): Promise<string> {
  cached ??= (async () => {
    const traits = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      String(navigator.hardwareConcurrency ?? ''),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('|')
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(traits))
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
    } catch {
      return '' // insecure context: the IP and email counters still apply
    }
  })()
  return cached
}
