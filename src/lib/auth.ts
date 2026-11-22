import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { normalizeCnpj } from "./cnpj";

export { formatCnpj, normalizeCnpj } from "./cnpj";

export const SESSION_COOKIE = "radar_sessao";
export const SESSION_DAYS = 30;
export const LOGIN_TOKEN_MINUTES = 20;
/** The sign-up confirmation link: long enough to open the inbox tomorrow morning. */
export const VERIFY_TOKEN_MINUTES = 24 * 60;
export const RESET_TOKEN_MINUTES = 30;
export const SENHA_MIN = 8;
export const SENHA_MAX = 200;

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

// --- Passwords: scrypt from node:crypto, stored as "scrypt$N$r$p$salt$key" (base64url). ---

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 };

function scryptAsync(senha: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  // maxmem must exceed 128 * N * r (32 MiB at N=2^15, r=8), which is Node's default ceiling.
  return new Promise((ok, fail) => scrypt(senha.normalize("NFKC"), salt, keylen, { ...opts, maxmem: 96 * 1024 * 1024 }, (e, k) => (e ? fail(e) : ok(k))));
}

/** Plain-language problem with a new password, or null if it is acceptable. No composition rules: length is what matters. */
export function problemaSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (senha.length > SENHA_MAX) return `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
  return null;
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scryptAsync(senha, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

// Hashed once, lazily: checked when the account does not exist (or has no password) so the response takes as long as a real check.
let dummy: Promise<string> | undefined;

/** Constant-time check. A null hash (no account, or a link-only account) always fails after the same amount of work. */
export async function verificarSenha(senha: string, armazenado: string | null | undefined): Promise<boolean> {
  const alvo = armazenado ?? (await (dummy ??= hashSenha(randomBytes(16).toString("hex"))));
  const [alg, n, r, p, salt, key] = alvo.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const esperado = Buffer.from(key, "base64url");
  const got = await scryptAsync(senha.slice(0, SENHA_MAX), Buffer.from(salt, "base64url"), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(esperado, got) && armazenado != null;
}

export type Identificador = { tipo: "email"; valor: string } | { tipo: "cnpj"; valor: string };

/** The single "E-mail ou CNPJ" sign-in field: anything with an @ is an e-mail, the rest must be a valid CNPJ. */
export function parseIdentificador(input: string): Identificador | null {
  const s = input.trim();
  if (s.includes("@")) {
    const email = normalizeEmail(s);
    return email ? { tipo: "email", valor: email } : null;
  }
  const cnpj = normalizeCnpj(s);
  return cnpj ? { tipo: "cnpj", valor: cnpj } : null;
}
