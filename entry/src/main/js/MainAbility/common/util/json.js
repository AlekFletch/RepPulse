/**
 * JSON with every non-ASCII character escaped as \uXXXX, so that one character == one byte.
 * @system.file readText reads by byte position/length (4 KB default chunk); ASCII-only
 * payloads make chunked reads safe regardless of the text content.
 */
export function toAsciiJson(value) {
  const json = JSON.stringify(value);
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    out += code < 0x7f ? json.charAt(i) : '\\u' + ('0000' + code.toString(16)).slice(-4);
  }
  return out;
}

/** JSON.parse that returns `fallback` instead of throwing. */
export function safeParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}
