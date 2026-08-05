export function deepClone(value) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch {}
  return JSON.parse(JSON.stringify(value));
}
