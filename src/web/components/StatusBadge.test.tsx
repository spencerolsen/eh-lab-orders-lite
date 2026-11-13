import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ORDER_STATUSES } from '../../shared/orders';
import { StatusBadge } from './StatusBadge';

const LABELS = {
  ordered: 'Ordered',
  collected: 'Collected',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

it.each(ORDER_STATUSES)(
  'status badge shows the label and the tint class for %s',
  (status) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(LABELS[status]);
    expect(badge.className).toBe(`badge badge-${status}`);
  },
);
