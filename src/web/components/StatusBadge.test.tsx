import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { StatusBadge } from './StatusBadge';

it.each(['ordered', 'collected', 'completed', 'cancelled'])(
  'status badge shows the status word for %s',
  (status) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(status);
    expect(badge.className).toBe(`badge badge-${status}`);
  },
);
