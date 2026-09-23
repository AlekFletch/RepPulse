/**
 * JSON with every non-ASCII character escaped as \uXXXX, so that one character == one byte.
 * @system.file readText reads by byte position/length (4 KB default chunk); ASCII-only
 * payloads make chunked reads safe regardless of the text content.
 */
export function toAsciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, function (ch) {
    return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });
}

/** JSON.parse that returns `fallback` instead of throwing. */
export function safeParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}
