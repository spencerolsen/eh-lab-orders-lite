import { useQuery } from '@tanstack/react-query';
import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';

import type { LabTest } from '../../shared/lab-tests';
import { matchTests } from '../../shared/match-tests';
import { fetchLabTests, LAB_TESTS_KEY } from '../catalog/api';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';

// The most suggestions shown at once.
export const MAX_SUGGESTIONS = 8;

// Step two of the New order modal: type part of a code or name and pick a
// test from the suggestions (matchTests, over the catalog the browser
// loaded; the server checks again on submit). Keyboard: Arrow Down and Up
// move the highlight, Enter adds the highlighted test and empties the box,
// Escape closes the suggestions. Enter never submits the order.
export function QuickAdd({
  disabled,
  selectedIds,
  onAdd,
  inputRef: input,
}: {
  disabled: boolean;
  selectedIds: string[];
  onAdd: (test: LabTest) => void;
  // The box itself, so the modal can move the focus back to it.
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const catalog = useQuery({
    queryKey: LAB_TESTS_KEY,
    queryFn: ({ signal }) => fetchLabTests(signal),
  });
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  // The highlighted suggestion's index, or -1 for none.
  const [highlight, setHighlight] = useState(-1);

  // Once a patient is chosen and the tests are loaded, the focus moves here:
  // the next step (with the patient already chosen, as on the patient page,
  // the box is first usable when the catalog arrives).
  const usable = !disabled && catalog.data !== undefined;
  useEffect(() => {
    if (usable) input.current?.focus();
  }, [usable, input]);

  const suggestions = catalog.data
    ? matchTests(text, catalog.data, selectedIds).slice(0, MAX_SUGGESTIONS)
    : [];
  const showList = open && !disabled && suggestions.length > 0;
  const highlighted = showList ? suggestions[highlight] : undefined;

  function add(test: LabTest) {
    onAdd(test);
    setText('');
    setHighlight(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      // Always: with nothing highlighted, Enter does nothing at all.
      event.preventDefault();
      if (highlighted) add(highlighted);
    } else if (event.key === 'Escape' && showList) {
      // Closes the suggestions only; the next Escape closes the dialog.
      event.preventDefault();
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <div className="field">
      <label htmlFor="quick-add">Add a test</label>
      <input
        id="quick-add"
        ref={input}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls="quick-add-suggestions"
        aria-activedescendant={
          highlighted ? `quick-add-${highlighted.id}` : undefined
        }
        aria-describedby="quick-add-help"
        disabled={disabled || !catalog.data}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <p id="quick-add-help" className="field-help">
        {disabled
          ? 'Choose a patient first'
          : 'Type part of a test code or name, then pick with the arrow keys and Enter'}
      </p>
      {catalog.isPending && <Loading label="Loading tests…" />}
      {catalog.isError && (
        <ErrorMessage
          error={catalog.error}
          onRetry={() => void catalog.refetch()}
        />
      )}
      {showList && (
        <ul
          id="quick-add-suggestions"
          role="listbox"
          aria-label="Matching tests"
          className="suggestions"
        >
          {suggestions.map((test, index) => (
            <li
              key={test.id}
              id={`quick-add-${test.id}`}
              role="option"
              aria-selected={index === highlight}
              // Keep the focus in the box, so a click works like Enter.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(test)}
            >
              <strong>{test.code}</strong> {test.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
