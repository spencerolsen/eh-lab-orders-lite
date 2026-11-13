import { describe, expect, it } from 'vitest';

import type { Patient } from '../../shared/patients';
import { changedFields, toFormValues } from './form-values';

const patient: Patient = {
  id: 'p1',
  firstName: 'Test',
  lastName: 'Patient',
  dateOfBirth: '1984-03-09',
  email: null,
  phone: '8015550101',
};

it('toFormValues makes a null email empty and formats the phone', () => {
  expect(toFormValues(patient)).toEqual({
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '1984-03-09',
    email: '',
    phone: '(801) 555-0101',
  });
  expect(toFormValues({ ...patient, phone: null }).phone).toBe('');
});

describe('changedFields', () => {
  const unchanged = {
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '1984-03-09',
    email: null,
    phone: '8015550101',
  };

  it('is empty when nothing differs', () => {
    expect(changedFields(unchanged, patient)).toEqual({});
  });

  it('keeps only the fields that differ, including a removed value as null', () => {
    expect(
      changedFields(
        {
          ...unchanged,
          lastName: 'Sample',
          email: 'new@example.test',
          phone: null,
        },
        patient,
      ),
    ).toEqual({ lastName: 'Sample', email: 'new@example.test', phone: null });
  });
});
