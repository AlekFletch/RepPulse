let counter = 0;

/** Locally unique id: time + counter + random. No external/crypto dependency. */
export function generateId(nowMs) {
  counter = (counter + 1) % 1296;
  const time = Math.floor(nowMs).toString(36);
  const seq = ('0' + counter.toString(36)).slice(-2);
  const rand = Math.floor(Math.random() * 1679616).toString(36);
  return time + seq + ('000' + rand).slice(-4);
}
