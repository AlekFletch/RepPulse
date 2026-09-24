/**
 * "{name}" templates for Node-side code and tests. Pages use $t(key, params) instead: on lite,
 * $t without params strips the placeholders.
 */
/** Fills "{name}" placeholders: fill('Подход {current} из {total}', { current: 2, total: 5 }). */
export function fill(template, params) {
  const text = String(template);
  let out = '';
  let pos = 0;
  while (pos < text.length) {
    const open = text.indexOf('{', pos);
    const close = open === -1 ? -1 : text.indexOf('}', open + 1);
    if (close === -1) {
      break;
    }
    const key = text.slice(open + 1, close);
    out += text.slice(pos, open);
    if (!isWord(key)) {
      out += '{';
      pos = open + 1;
      continue;
    }
    const known = params && Object.prototype.hasOwnProperty.call(params, key);
    out += known ? String(params[key]) : text.slice(open, close + 1);
    pos = close + 1;
  }
  return out + text.slice(pos);
}

/** Letters, digits and underscore only (what \w matches); no RegExp on the watch. */
function isWord(text) {
  if (text.length === 0) {
    return false;
  }
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
    if (!ok) {
      return false;
    }
  }
  return true;
}
