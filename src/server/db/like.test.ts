import { expect, it } from 'vitest';

import { escapeLike } from './like';

it('escapeLike puts a backslash before %, _ and a backslash', () => {
  expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
});

it('escapeLike leaves other text as it is', () => {
  expect(escapeLike("Jane O'Sample")).toBe("Jane O'Sample");
});
