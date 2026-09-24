/**
 * JSON with every non-ASCII character escaped as \uXXXX, so that one character == one byte.
 * @system.file readText reads by byte position/length (4 KB default chunk); ASCII-only
 * payloads make chunked reads safe regardless of the text content.
 */
export function toAsciiJson(value) {
  const json = JSON.stringify(value);
  // Workout data is almost always pure ASCII: return it untouched. Growing a string char by char
  // allocates a new string per step, which exhausted the ~100 KB JS heap of the watch simulator.
  let i = 0;
  while (i < json.length && json.charCodeAt(i) < 0x7f) {
    i++;
  }
  if (i === json.length) {
    return json;
  }
  const parts = [json.slice(0, i)];
  let start = i;
  for (; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code >= 0x7f) {
      parts.push(json.slice(start, i), '\\u' + ('0000' + code.toString(16)).slice(-4));
      start = i + 1;
    }
  }
  parts.push(json.slice(start));
  return parts.join('');
}

/** JSON.parse that returns `fallback` instead of throwing. */
export function safeParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}
