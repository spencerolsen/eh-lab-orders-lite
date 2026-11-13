// Runs before each component test file (the `component` Vitest project).
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup(); // unmount what the test rendered
  vi.unstubAllGlobals(); // put back the real fetch
  vi.restoreAllMocks();
});
