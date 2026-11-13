// Tests for the import-boundary rule. Each case is a small piece of code placed
// at a file path under src/, and says whether the rule should report it.

import path from 'node:path';

import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';

import { importBoundary } from './import-boundary.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const src = path.resolve(import.meta.dirname, '..', 'src');
const file = (relative) => path.join(src, relative);

// typescript-eslint calls process.emitWarning when a rule reads a deprecated
// AST property (TSImportType.argument, for example). The last test below fails
// if the rule did, so the test output stays free of deprecation warnings.
// (Vitest's worker does not pass the 'warning' event on, so the call itself is
// recorded.)
const deprecations = [];
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
  if (type === 'DeprecationWarning') deprecations.push(String(warning));
  emitWarning(warning, ...rest);
};
afterAll(() => {
  process.emitWarning = emitWarning;
});

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser },
});

ruleTester.run('import-boundary', importBoundary, {
  valid: [
    // Both sides may import shared.
    {
      filename: file('server/orders/service.ts'),
      code: "import { m } from '../../shared/money';",
    },
    {
      filename: file('web/orders/page.ts'),
      code: "import { m } from '../../shared/money';",
    },
    // A package name that contains "server" is not a folder in src/. (Package
    // names are never checked, so this case documents that; it cannot fail.)
    {
      filename: file('web/main.ts'),
      code: "import { renderToString } from 'react-dom/server';",
    },
    // A top-level folder whose name only starts with "server" is not src/server.
    {
      filename: file('web/orders/page.ts'),
      code: "import { u } from '../../server-utils/u';",
    },
  ],
  invalid: [
    {
      filename: file('server/orders/routes.ts'),
      code: "import { p } from '../../web/orders/page';",
      errors: [{ messageId: 'crossed', data: { from: 'server', to: 'web' } }],
    },
    {
      filename: file('web/orders/page.ts'),
      code: "import { s } from '../../server/orders/service';",
      errors: [{ messageId: 'crossed', data: { from: 'web', to: 'server' } }],
    },
    {
      filename: file('shared/money.ts'),
      code: "import { s } from '../server/config';",
      errors: [
        { messageId: 'crossed', data: { from: 'shared', to: 'server' } },
      ],
    },
    {
      filename: file('shared/money.ts'),
      code: "import { a } from '../web/App';",
      errors: [{ messageId: 'crossed', data: { from: 'shared', to: 'web' } }],
    },
    {
      filename: file('web/orders/page.ts'),
      code: "import type { Row } from '../../server/db/types';",
      errors: [{ messageId: 'crossed', data: { from: 'web', to: 'server' } }],
    },
    {
      filename: file('web/orders/index.ts'),
      code: "export { s } from '../../server/orders/service';",
      errors: [{ messageId: 'crossed', data: { from: 'web', to: 'server' } }],
    },
    {
      filename: file('web/orders/index.ts'),
      code: "export * from '../../server/orders/service';",
      errors: [{ messageId: 'crossed', data: { from: 'web', to: 'server' } }],
    },
    {
      filename: file('web/orders/page.ts'),
      code: "const s = () => import('../../server/orders/service');",
      errors: [{ messageId: 'crossed', data: { from: 'web', to: 'server' } }],
    },
    {
      filename: file('web/orders/page.ts'),
      code: 'const s = () => import(`../../server/orders/service`);',
      errors: [{ messageId: 'crossed', data: { from: 'web', to: 'server' } }],
    },
    {
      filename: file('web/orders/page.ts'),
      code: "type S = typeof import('../../server/orders/service');",
      errors: [{ messageId: 'crossed', data: { from: 'web', to: 'server' } }],
    },
  ],
});

it('reads no deprecated AST property while checking', () => {
  expect(deprecations).toEqual([]);
});
