/** All app files live under internal://app/ (URI max 128 chars, no *+,:;<=>?[]| characters). */
export const APP_ROOT = 'internal://app/';
const MAX_URI_LENGTH = 128;
const FORBIDDEN = /[*+,:;<=>?[\]|"\\]/;

/** Relative path ("workouts/abc.json") -> URI; returns null for an invalid path. */
export function toUri(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    return null;
  }
  if (relativePath.charAt(0) === '/' || relativePath.indexOf('..') !== -1 || FORBIDDEN.test(relativePath)) {
    return null;
  }
  const uri = APP_ROOT + relativePath;
  return uri.length <= MAX_URI_LENGTH ? uri : null;
}
