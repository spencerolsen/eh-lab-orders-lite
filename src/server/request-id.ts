import { randomUUID } from 'node:crypto';

// An incoming x-request-id is kept only when it is 1 to 64 characters of
// letters, digits, '-', '_' and '.', which covers UUIDs and the ids proxies
// usually send. Anything else (empty, too long, spaces, quotes, control
// characters, or the header sent twice) is replaced by a new UUID, so a caller
// cannot put arbitrary text into the logs or the response headers.
const SANE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function pickRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && SANE_REQUEST_ID.test(header)) return header;
  return randomUUID();
}
