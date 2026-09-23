function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** Seconds -> "MM:SS" (or "H:MM:SS" from one hour). Negative input is treated as 0. */
export function formatDuration(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return h + ':' + pad2(m) + ':' + pad2(s);
  }
  return pad2(m) + ':' + pad2(s);
}

/** Cadence rounded to an integer, per spec ("24 повт./мин"). */
export function roundCadence(cadence) {
  if (typeof cadence !== 'number' || !isFinite(cadence) || cadence < 0) {
    return 0;
  }
  return Math.round(cadence);
}

/** Fills "{name}" placeholders: fill('Подход {current} из {total}', { current: 2, total: 5 }). */
export function fill(template, params) {
  return String(template).replace(/\{(\w+)\}/g, function (match, key) {
    return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
  });
}
