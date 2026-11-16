import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { ErrorMessage } from './ErrorMessage';

// A small "are you sure?" dialog: a native <dialog> opened with showModal()
// while this component is mounted, so the page mounts it only when it asks.
// The focus goes to the safe button (the one that changes nothing) and comes
// back to whatever had it, the button that opened the dialog, when it closes.
// `onConfirm` returns the promise of the work; further confirms, the safe
// button and Escape are ignored until it has settled. Escape and the safe
// button call `onCancel`. While `pending` both buttons
// are disabled and Escape does nothing; the page closes the dialog itself
// (by unmounting it) when the work succeeds. A failure is passed as `error`
// and shown inside the dialog, with the buttons enabled again for a retry.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  pending: boolean;
  error?: unknown;
  onConfirm: () => Promise<unknown> | void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const safeButton = useRef<HTMLButtonElement>(null);
  // Whatever had the focus when the dialog opened, read while rendering: by
  // the time effects run, the dialog has taken the focus.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    safeButton.current?.focus();
    return () => {
      element.close();
      opener?.focus();
    };
  }, [opener]);

  // A guard that does not wait for React: `pending` reaches the screen a
  // moment after the click, and a second click, a held Enter or an Escape can
  // land in that gap. `locked` is set at once, in the click handler, and let go
  // when the promise `onConfirm` returns has settled.
  const locked = useRef(false);

  // While the request runs, Escape is stopped at the key press on the whole
  // document (the focus may sit on a disabled button).
  useEffect(() => {
    const stopEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && locked.current) event.preventDefault();
    };
    document.addEventListener('keydown', stopEscape, true);
    return () => document.removeEventListener('keydown', stopEscape, true);
  }, []);

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby={titleId}
      // Escape closes a native dialog. The `close` event also arrives after
      // the effect's own close() (and, in development, after StrictMode's
      // double run, when the dialog is open again): that one is ignored.
      onClose={() => {
        if (!dialog.current?.open) onCancel();
      }}
      onCancel={(event) => {
        if (pending || locked.current) event.preventDefault();
      }}
    >
      <div className="stack">
        <h2 id={titleId}>{title}</h2>
        {children}
        {error != null && <ErrorMessage error={error} />}
        <div className="form-actions">
          <button
            type="button"
            className="button-danger"
            disabled={pending}
            onClick={() => {
              if (pending || locked.current) return;
              locked.current = true;
              void Promise.resolve(onConfirm()).finally(() => {
                locked.current = false;
              });
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
          <button
            ref={safeButton}
            type="button"
            className="button-secondary"
            disabled={pending}
            onClick={() => {
              if (!locked.current) onCancel();
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
