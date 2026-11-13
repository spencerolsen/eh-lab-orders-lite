import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import { PatientForm } from './PatientForm';

function renderForm(onSubmit = vi.fn(() => Promise.resolve())) {
  render(<PatientForm submitLabel="Save patient" onSubmit={onSubmit} />);
  return onSubmit;
}

const field = (name: string) => screen.getByLabelText(name, { exact: false });

// The error text under a field (its aria-describedby), or null.
function errorUnder(name: string): string | null {
  const id = field(name).getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

async function fill(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    await userEvent.type(field(name), value);
  }
}

const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Save patient' }));

describe('PatientForm', () => {
  it('shows an error under each missing field, and the contact error under both', async () => {
    const onSubmit = renderForm();
    await save();
    expect(errorUnder('First name')).toBe('First name is required');
    expect(errorUnder('Last name')).toBe('Last name is required');
    expect(errorUnder('Date of birth')).toBe('Date of birth is required');
    expect(errorUnder('Email')).toBe(
      'Email is required when there is no phone number',
    );
    expect(errorUnder('Phone')).toBe(
      'Phone is required when there is no email',
    );
    expect(field('First name').getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears an error when its field is edited, and both contact errors when either is', async () => {
    renderForm();
    await save();
    await fill({ 'First name': 'T' });
    expect(errorUnder('First name')).toBeNull();
    expect(errorUnder('Last name')).toBe('Last name is required');
    await fill({ Phone: '5' });
    expect(errorUnder('Phone')).toBeNull();
    expect(errorUnder('Email')).toBeNull();
  });

  it('shows the date of birth problem under its field', async () => {
    renderForm();
    await fill({ 'Date of birth': '31/12/1990' });
    await save();
    expect(errorUnder('Date of birth')).toBe(
      'Date of birth must be a date written YYYY-MM-DD',
    );
  });

  it('sends the parsed values with one contact, and disables the button while saving', async () => {
    let finish!: () => void;
    const onSubmit = renderForm(
      vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    );
    await fill({
      'First name': ' Test ',
      'Last name': 'Patient',
      'Date of birth': '1984-03-09',
      Phone: '(801) 555-0100',
    });
    await save();
    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Test',
      lastName: 'Patient',
      dateOfBirth: '1984-03-09',
      phone: '8015550100',
    });
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toHaveProperty('disabled', true);
    finish();
    expect(
      await screen.findByRole('button', { name: 'Save patient' }),
    ).toHaveProperty('disabled', false);
  });

  it("puts a 400's field problems under their fields, with the message and reference", async () => {
    renderForm(
      vi.fn(() =>
        Promise.reject(
          new ApiError(
            400,
            'VALIDATION_ERROR',
            'The request is not valid',
            'req-7',
            [{ field: 'dateOfBirth', reason: 'cannot be in the future' }],
          ),
        ),
      ),
    );
    await fill({
      'First name': 'Test',
      'Last name': 'Patient',
      'Date of birth': '2000-01-01',
      Email: 'test.patient@example.test',
    });
    await save();
    expect(errorUnder('Date of birth')).toBe(
      'Date of birth cannot be in the future',
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'The request is not valid. Reference: req-7',
    );
  });
});
