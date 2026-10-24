/** Derive the visible marker label from the persistent report code, never array order. */
export function reportPinLabel(code: unknown): string {
  const match = typeof code === "string" ? /^(?:COSA|OFT)-(\d+)$/.exec(code) : null;
  return match ? match[1].replace(/^0+(?=\d)/, "").padStart(2, "0") : "•";
}
