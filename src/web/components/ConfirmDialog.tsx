import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { ErrorMessage } from './ErrorMessage';

// A small "are you sure?" dialog: a native <dialog> opened with showModal()
// while this component is mounted, so the page mounts it only when it asks.
// The focus goes to the safe button (the one that changes nothing) and comes
// back to whatever had it, the button that opened the dialog, when it closes.
// Escape and the safe button call `onCancel`. While `pending` both buttons
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
  onConfirm: () => void;
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

  // While the request runs, Escape is stopped at the key press on the whole
  // document (the focus may sit on a disabled button).
  useEffect(() => {
    if (!pending) return;
    const stopEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    };
    document.addEventListener('keydown', stopEscape, true);
    return () => document.removeEventListener('keydown', stopEscape, true);
  }, [pending]);

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
        if (pending) event.preventDefault();
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
              if (!pending) onConfirm();
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
          <button
            ref={safeButton}
            type="button"
            className="button-secondary"
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
