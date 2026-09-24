export const StorageErrorCode = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  IO: 'IO',
  INVALID_PATH: 'INVALID_PATH',
  VALUE_TOO_LONG: 'VALUE_TOO_LONG',
  UNKNOWN: 'UNKNOWN'
});

/** @system.file fail codes (OpenHarmony docs): 202 bad argument, 300 I/O, 301 not found. */
export function fromFileFailure(code, message) {
  let mapped = StorageErrorCode.UNKNOWN;
  if (code === 301) {
    mapped = StorageErrorCode.NOT_FOUND;
  } else if (code === 300) {
    mapped = StorageErrorCode.IO;
  } else if (code === 202) {
    mapped = StorageErrorCode.INVALID_PATH;
  }
  return { code: mapped, platformCode: code, message: message || '' };
}

export function storageError(code, message) {
  return { code: code, platformCode: null, message: message || '' };
}
