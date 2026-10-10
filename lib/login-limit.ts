// Best effort per instance; use a shared store/WAF for distributed enforcement on Vercel.
const attempts = new Map<string, { count: number; until: number }>();
export function allowLogin(key: string, now = Date.now()) {
  attempts.forEach((value, id) => { if (value.until <= now) attempts.delete(id); });
  let bucket = attempts.get(key);
  if (!bucket) {
    if (attempts.size >= 10000) return false;
    bucket = { count: 0, until: now + 15 * 60 * 1000 };
    attempts.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= 10;
}