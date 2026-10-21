import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Retain the established salted hash format during the backend migration.
export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pin, salt, 32).toString("hex");
}

export function checkPin(pin: string, hash: string) {
  const [salt, digest] = hash.split(":");
  if (!salt || !digest) return false;
  const actual = scryptSync(pin, salt, 32);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
