// The patient name search, for every screen that finds a patient by name:
// the Patients list, the New order patient picker (LAB-12) and the orders
// patient filter (LAB-14).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { SEARCH_MAX_LENGTH } from '../../shared/patients';
import { fetchPatients, patientListKey } from './api';

// How long typing must pause before the search is sent.
export const SEARCH_DELAY_MS = 300;

// `value`, but only once it has stopped changing for `delayMs`: a search box
// passes what the user types and searches with what this returns, so there
// is one request when typing pauses, not one per keystroke.
export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DELAY_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// Search text cut to the length the server accepts (SEARCH_MAX_LENGTH), so a
// long text from the address or a paste never makes a request the server
// refuses with a 400. `usePatientSearch` applies it before the request; the
// search boxes also set `maxLength={SEARCH_MAX_LENGTH}` on their input.
export function limitSearchText(text: string): string {
  return text.slice(0, SEARCH_MAX_LENGTH).trim();
}

// The patients whose name matches `q` (trimmed; '' for every patient), from
// GET /api/patients?q= (docs/api.md: at most SEARCH_RESULT_LIMIT). While a
// new search runs, the previous results stay instead of a loading state.
export function usePatientSearch(text: string) {
  const q = limitSearchText(text);
  return useQuery({
    queryKey: patientListKey(q),
    queryFn: ({ signal }) => fetchPatients(q, signal),
    placeholderData: keepPreviousData,
  });
}
