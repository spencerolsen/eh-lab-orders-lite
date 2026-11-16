// The orders list filters as they are kept in the page address:
// "?status=collected&patientId=<uuid>". Only the patient's id goes in the
// address, never a name. Other parameters (the open order, "?order=") pass
// through untouched.
import { z } from 'zod';

import {
  DEFAULT_ORDER_SORT,
  DEFAULT_ORDER_SORT_DIR,
  ORDER_SORT_DIRS,
  ORDER_SORTS,
  type OrderSort,
  type OrderSortDir,
  type OrderStatus,
  orderStatusSchema,
} from '../../shared/orders';

export type OrderFilters = {
  status?: OrderStatus;
  patientId?: string;
};

// The filters in the address. A value that is not valid (a made-up status, a
// patient id that is not a uuid) is ignored, as if it were not there.
export function readFilters(params: URLSearchParams): OrderFilters {
  const status = orderStatusSchema.safeParse(params.get('status'));
  const patientId = z.uuid().safeParse(params.get('patientId'));
  return {
    ...(status.success ? { status: status.data } : {}),
    ...(patientId.success ? { patientId: patientId.data.toLowerCase() } : {}),
  };
}

// A copy of `params` with the filters replaced by `filters`. An unset filter
// is left out (the default view has a clean address).
export function writeFilters(
  params: URLSearchParams,
  filters: OrderFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('status');
  next.delete('patientId');
  if (filters.status) next.set('status', filters.status);
  if (filters.patientId) next.set('patientId', filters.patientId);
  return next;
}

export function hasFilters(filters: OrderFilters): boolean {
  return filters.status !== undefined || filters.patientId !== undefined;
}

// The sort as it is kept in the address: "?sort=readyBy&dir=asc". Both are
// left out when they are the default (newest first), so the default view has
// a clean address. A value that is not valid is ignored, as an invalid filter
// is: that part falls back to its default.
export type OrderSortState = { sort: OrderSort; dir: OrderSortDir };

export const DEFAULT_SORT_STATE: OrderSortState = {
  sort: DEFAULT_ORDER_SORT,
  dir: DEFAULT_ORDER_SORT_DIR,
};

export function readSort(params: URLSearchParams): OrderSortState {
  const sort = ORDER_SORTS.find((value) => value === params.get('sort'));
  const dir = ORDER_SORT_DIRS.find((value) => value === params.get('dir'));
  return {
    sort: sort ?? DEFAULT_SORT_STATE.sort,
    dir: dir ?? DEFAULT_SORT_STATE.dir,
  };
}

export function isDefaultSort(state: OrderSortState): boolean {
  return (
    state.sort === DEFAULT_SORT_STATE.sort &&
    state.dir === DEFAULT_SORT_STATE.dir
  );
}

// A copy of `params` with the sort replaced; the default sort is left out.
export function writeSort(
  params: URLSearchParams,
  state: OrderSortState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('sort');
  next.delete('dir');
  if (!isDefaultSort(state)) {
    next.set('sort', state.sort);
    next.set('dir', state.dir);
  }
  return next;
}

// What a click on a column's header asks for: the same column again reverses
// the direction; another column starts ascending, except Created, which
// starts with the newest.
export function nextSort(
  current: OrderSortState,
  column: OrderSort,
): OrderSortState {
  if (current.sort === column) {
    return { sort: column, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { sort: column, dir: column === 'created' ? 'desc' : 'asc' };
}
