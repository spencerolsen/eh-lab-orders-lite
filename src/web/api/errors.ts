import { ApiError, UNREACHABLE_CODE } from './client';

export const SERVER_ERROR_MESSAGE =
  'Something went wrong on the server. Try again.';
export const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong. Try again.';

// The sentence to show the user for a failed request.
// - The server could not be reached: "Can't reach the server. Try again."
// - A 4xx (400, 409, 422, ...): the server's own message, which the API
//   writes to be shown to the user (docs/api.md).
// - A 5xx: a generic message; the details are in the server log.
// - Anything that is not an ApiError (a bug in the page): a generic message.
// When the server sent a request id, the text ends with "Reference: <id>", so
// the user can quote it and a developer can find the matching log lines.
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return UNEXPECTED_ERROR_MESSAGE;

  let text: string;
  if (error.code === UNREACHABLE_CODE) text = error.message;
  else if (error.status >= 500) text = SERVER_ERROR_MESSAGE;
  else text = error.message;

  if (!error.requestId) return text;
  // The API's messages have no closing full stop ("The request is not valid"),
  // so one is added before the reference to keep two sentences.
  const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
  return `${sentence} Reference: ${error.requestId}`;
}
