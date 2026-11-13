import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { PatientLabel } from './PatientLabel';

it('PatientLabel shows the name with the date of birth', () => {
  const { container } = render(
    <PatientLabel
      patient={{
        firstName: 'Test',
        lastName: 'Patient',
        dateOfBirth: '1984-03-09',
      }}
    />,
  );
  expect(container.textContent).toBe('Test Patient (born Mar 9, 1984)');
});
