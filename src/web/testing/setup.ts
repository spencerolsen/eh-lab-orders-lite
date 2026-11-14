// Runs before each component test file (the `component` Vitest project).
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup(); // unmount what the test rendered
  vi.unstubAllGlobals(); // put back the real fetch
  vi.restoreAllMocks();
});

// jsdom has the <dialog> element but none of its behaviour. This stand-in
// does what a browser does, no more:
// - showModal() opens it and puts it on top of the open-dialog stack;
// - close() closes it and then fires `close` on a later task, as a browser
//   queues it;
// - Escape, unless a handler prevented it (the quick-add box does, to close
//   its suggestions), fires a cancelable `cancel` on the most recently opened
//   dialog and then closes it.
// Focus is not moved: the app moves it itself, so the tests check the app.
const openModals: HTMLDialogElement[] = [];
HTMLDialogElement.prototype.showModal = function showModal(
  this: HTMLDialogElement,
) {
  this.open = true;
  openModals.push(this);
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  const at = openModals.indexOf(this);
  if (at >= 0) openModals.splice(at, 1);
  setTimeout(() => this.dispatchEvent(new Event('close')));
};
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = openModals.at(-1);
  if (top && top.dispatchEvent(new Event('cancel', { cancelable: true }))) {
    top.close();
  }
});
