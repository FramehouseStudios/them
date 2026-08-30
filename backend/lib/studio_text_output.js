function normalizeStudioTextOutput(value = "", maxChars = 32_000) {
  const limit = Math.max(1, Math.round(Number(maxChars || 32_000)));
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (normalized.length <= limit) return normalized;
  return normalized.slice(0, limit).replace(/[ \t]+$/g, "").trimEnd();
}

export { normalizeStudioTextOutput };
