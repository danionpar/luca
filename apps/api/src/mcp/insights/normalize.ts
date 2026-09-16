import { createHash } from "node:crypto";

/**
 * Normalizes free-form observation content before hashing, so that
 * inconsequential differences (leading/trailing whitespace, repeated
 * whitespace, casing) never defeat duplicate detection. Two saves that say
 * the same thing with slightly different formatting are still the same
 * observation as far as `normalized_hash` is concerned.
 */
export function normalizeForHash(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, " ");
}

/** SHA-256 of the normalized content, hex-encoded — what `observations.normalized_hash` stores. */
export function computeNormalizedHash(content: string): string {
  return createHash("sha256").update(normalizeForHash(content)).digest("hex");
}
