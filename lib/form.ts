/** Small helpers for reading untrusted FormData in server actions. */
export type FormState = { ok: boolean; message?: string };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function str(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export function optStr(fd: FormData, key: string, max = 200): string | null {
  return str(fd, key, max) || null;
}

export function uuidOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key, 64);
  return UUID_RE.test(v) ? v : null;
}
