export function normalizeGeneratedText(value) {
  return value.replace(/\r\n?|\n/g, "\n");
}
