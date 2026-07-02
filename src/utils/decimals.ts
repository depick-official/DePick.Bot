/**
 * Decimals helpers for converting between user-typed amounts and raw uint256
 * token units. ethers v6 isn't a dependency of this Mini App; we implement
 * just enough to support the deposit flow's amount input + raw-PICK display.
 *
 * Both functions trust the caller for `decimals` — source from the BE
 * `/deposits/config` response per `feedback_no_hardcoded_decimals_or_precision`.
 */

/**
 * Parse a human-readable decimal string into a raw bigint.
 * Returns null on invalid input (non-numeric, negative, too many fractional
 * digits for the token's precision, empty).
 *
 *   toRaw("10",   18) → 10000000000000000000n
 *   toRaw("0.5",  6)  → 500000n
 *   toRaw("0.0000001", 6) → null  // 7 frac digits > 6
 */
export function toRaw(amountStr: string, decimals: number): bigint | null {
  const trimmed = amountStr.trim();
  if (trimmed === '' || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [intPart, fracPart = ''] = trimmed.split('.');
  if (fracPart.length > decimals) return null;
  const fracPadded = fracPart.padEnd(decimals, '0');
  const combined = `${intPart}${fracPadded}`.replace(/^0+(?=\d)/, '');
  try {
    return BigInt(combined === '' ? '0' : combined);
  } catch {
    return null;
  }
}

/**
 * Format a raw bigint (or BigInt-string) as a human decimal string, trimming
 * trailing zeros in the fractional part.
 *
 *   fromRaw("10000000000000000000", 18) → "10"
 *   fromRaw("500000",                6) → "0.5"
 *   fromRaw("123456",                4) → "12.3456"
 */
export function fromRaw(rawStr: string | bigint, decimals: number): string {
  const raw = typeof rawStr === 'bigint' ? rawStr : BigInt(rawStr);
  if (raw === 0n) return '0';
  const base = 10n ** BigInt(decimals);
  const intPart = raw / base;
  const fracPart = raw % base;
  if (fracPart === 0n) return intPart.toString();
  const fracStr = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${intPart}.${fracStr}`;
}
