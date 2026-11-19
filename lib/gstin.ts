const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** True if `gstin` has the 15-character GSTIN shape and a valid check digit. */
export function isValidGstin(gstin: string): boolean {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}
