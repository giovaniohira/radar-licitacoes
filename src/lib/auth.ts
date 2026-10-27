import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "radar_sessao";
export const SESSION_DAYS = 30;
export const LOGIN_TOKEN_MINUTES = 20;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET precisa ter 32+ caracteres");
  return s;
}

function hmac(data: string, key = secret()): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/** Session value: "<userId>.<expiresEpochSec>.<hmac>". Stateless; rotating SESSION_SECRET logs everyone out. */
export function signSession(userId: number, now = Date.now(), key?: string): string {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  const body = `${userId}.${exp}`;
  return `${body}.${hmac(body, key)}`;
}

/** Returns the user id and when the session was issued (epoch seconds), or null if forged or expired. */
export function verifySession(value: string | undefined, now = Date.now(), key?: string): { id: number; emitida: number } | null {
  if (!value) return null;
  const [uid, exp, sig] = value.split(".");
  if (!uid || !exp || !sig) return null;
  const expected = Buffer.from(hmac(`${uid}.${exp}`, key));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  if (Number(exp) * 1000 < now) return null;
  const id = Number(uid);
  return Number.isInteger(id) && id > 0 ? { id, emitida: Number(exp) - SESSION_DAYS * 86400 } : null;
}

/** Per-user secret for the read-only calendar feed URL. */
export function icsToken(userId: number, key?: string): string {
  return hmac(`ics.${userId}`, key).slice(0, 32);
}

export function verifyIcsToken(userId: number, token: string, key?: string): boolean {
  const expected = Buffer.from(icsToken(userId, key));
  const got = Buffer.from(token);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function newLoginToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}
