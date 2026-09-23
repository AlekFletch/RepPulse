// ES5-safe helpers. Lite JS (JerryScript) support for ES2015+ built-ins is not
// guaranteed, so Object.assign / Array.prototype.find / etc. are avoided.

export function extend(target) {
  for (let i = 1; i < arguments.length; i++) {
    const src = arguments[i];
    if (src === null || src === undefined) {
      continue;
    }
    for (const key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key)) {
        target[key] = src[key];
      }
    }
  }
  return target;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  return value > max ? max : value;
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

export function isInteger(value) {
  return isFiniteNumber(value) && Math.floor(value) === value;
}

export function hasValue(value) {
  return value !== null && value !== undefined;
}

export function indexWhere(list, predicate) {
  for (let i = 0; i < list.length; i++) {
    if (predicate(list[i], i)) {
      return i;
    }
  }
  return -1;
}
