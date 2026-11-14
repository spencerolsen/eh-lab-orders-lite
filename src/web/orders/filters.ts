// The orders list filters as they are kept in the page address:
// "?status=collected&patientId=<uuid>". Only the patient's id goes in the
// address, never a name. Other parameters (the open order, "?order=") pass
// through untouched.
import { z } from 'zod';

import { type OrderStatus, orderStatusSchema } from '../../shared/orders';

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
