// Runs before each component test file (the `component` Vitest project).
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup(); // unmount what the test rendered
  vi.unstubAllGlobals(); // put back the real fetch
  vi.restoreAllMocks();
});

// jsdom has no showModal(), close() or Escape handling for <dialog>. This
// stands in for the three, enough for the panel and dialog tests: showModal
// sets `open` and moves focus in, close clears it and queues "close", and Escape closes the last
// opened modal dialog, as a browser does.
const openModals: HTMLDialogElement[] = [];
HTMLDialogElement.prototype.showModal = function showModal(
  this: HTMLDialogElement,
) {
  this.setAttribute('open', '');
  openModals.push(this);
  // A browser moves focus inside; the first button stands in for that.
  this.querySelector('button')?.focus();
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.open) return;
  this.removeAttribute('open');
  const at = openModals.indexOf(this);
  if (at >= 0) openModals.splice(at, 1);
  // A browser queues the event as a task; it does not run it at once.
  setTimeout(() => this.dispatchEvent(new Event('close')));
};
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') openModals.at(-1)?.close();
});
