import { describe, expect, it } from 'vitest';

import { pickRequestId } from './request-id';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('pickRequestId', () => {
  it.each([
    'abc-123',
    '0b6c9f0e-6a4e-4a43-9d38-2f1b3c4d5e6f',
    'Trace_1.2',
    'x'.repeat(64),
  ])('request id header is accepted when valid: %s', (header) => {
    expect(pickRequestId(header)).toBe(header);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['65 characters', 'x'.repeat(65)],
    ['a space', 'abc 123'],
    ['a quote', 'abc"123'],
    ['a newline', 'abc\n123'],
    ['a slash', '../etc'],
    ['non-ASCII', 'abcé'],
    ['sent twice', ['abc-1', 'abc-2']],
  ])('request id header is replaced when malformed: %s', (_label, header) => {
    const id = pickRequestId(header);
    expect(id).toMatch(UUID);
    expect(id).not.toBe(header);
  });

  it('generates a new id each time', () => {
    expect(pickRequestId(undefined)).not.toBe(pickRequestId(undefined));
  });
});
