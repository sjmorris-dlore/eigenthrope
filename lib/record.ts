/**
 * The Record — sealed observations.
 *
 * A player writes a free-form theory about the mystery and seals it: the text
 * is stored server-side (hidden), and a salted SHA-256 hash goes on-ledger in
 * an `eigenthrope/seal` memo on a 1-drop payment to the vault, signed in
 * Xaman. The ledger timestamp makes "I called it first" provable by anyone;
 * the salt keeps short/guessable theories from being brute-forced from their
 * hash. On reveal the salt and text go public so anyone can verify
 * sha256(salt + "\n" + text) against the chain.
 *
 * The Record is PERMANENT: it survives episodes, universes, and game resets.
 * Seal records carry no reset_version on purpose.
 *
 * Lifecycle: pending_signature → sealed → revealed → vindicated | denied
 * (a revealed-but-unjudged seal is "open" — the author judges reveals only,
 * there is no scheduled review).
 */

import { createHash, randomBytes } from 'crypto'

export const SEALS_TABLE = 'eigenthrope_seals'

/** Max unrevealed seals per wallet — anti-shotgun: sealing a 4th means revealing one first. */
export const SEAL_CAP = 3

export const SEAL_TEXT_MIN = 10
export const SEAL_TEXT_MAX = 500

/** Pending payloads older than this don't count against the cap (Xaman payloads expire). */
export const PENDING_TTL_MS = 15 * 60_000

export type SealStatus = 'pending_signature' | 'sealed' | 'revealed' | 'vindicated' | 'denied'

export interface SealRecord {
  seal_id: string          // Xaman payload uuid
  account: string
  status: SealStatus
  text: string             // NEVER exposed publicly until revealed
  salt: string             // NEVER exposed publicly until revealed
  hash: string             // sha256(salt + "\n" + text), hex — public from the start
  context: string          // where the game stood at sealing, e.g. "U002 · Episode 1 · Ashfang Mountain"
  created_at: string
  sealed_at?: string
  tx_hash?: string         // the on-ledger anchor
  revealed_at?: string
  judged_at?: string
  judgment_note?: string   // optional author note shown with the verdict
}

export function newSalt(): string {
  return randomBytes(16).toString('hex')
}

export function sealHash(salt: string, text: string): string {
  return createHash('sha256').update(`${salt}\n${text}`, 'utf8').digest('hex')
}

export const ACCOUNT_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/

/**
 * Prove wallet ownership via the Xaman OAuth2 session token the site's
 * wallet-connect flow already holds (same pattern as /api/alias — the
 * userinfo endpoint returns the account the token was issued for; we never
 * trust a client-supplied account for owner-only reads or writes).
 */
export async function verifyXamanAccount(authorization: string | null): Promise<string | null> {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const res = await fetch('https://oauth2.xumm.app/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const info = await res.json() as { sub?: string; account?: string }
    const account = (info.sub ?? info.account)?.trim()
    return account && ACCOUNT_RE.test(account) ? account : null
  } catch {
    return null
  }
}

/** The public projection of a seal — everything except the hidden text/salt. */
export interface PublicSeal {
  seal_id: string
  account: string
  status: Exclude<SealStatus, 'pending_signature'>
  hash: string
  context: string
  sealed_at?: string
  tx_hash?: string
  revealed_at?: string
  judged_at?: string
  judgment_note?: string
  /** Present only once revealed — with salt, so anyone can verify the hash. */
  text?: string
  salt?: string
  /** Present only for the authenticated owner while still sealed. */
  own_text?: string
}

/**
 * Sanitize a seal for a given viewer. Sealed text/salt stay hidden from
 * everyone except the owner (who sees their own text as `own_text`);
 * revealed seals expose text + salt to the world for verification.
 */
export function publicSeal(seal: SealRecord, viewerAccount: string | null): PublicSeal {
  const revealed = seal.status === 'revealed' || seal.status === 'vindicated' || seal.status === 'denied'
  return {
    seal_id: seal.seal_id,
    account: seal.account,
    status: seal.status as PublicSeal['status'],
    hash: seal.hash,
    context: seal.context,
    sealed_at: seal.sealed_at,
    tx_hash: seal.tx_hash,
    revealed_at: seal.revealed_at,
    judged_at: seal.judged_at,
    judgment_note: seal.judgment_note,
    ...(revealed ? { text: seal.text, salt: seal.salt } : {}),
    ...(!revealed && viewerAccount === seal.account ? { own_text: seal.text } : {}),
  }
}
