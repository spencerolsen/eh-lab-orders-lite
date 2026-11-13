// The import boundary between the three source folders.
//
//   src/server  may import src/shared, never src/web
//   src/web     may import src/shared, never src/server
//   src/shared  imports neither
//
// Imports in this repo are relative ("../shared/money"), so the rule works out
// which folder each import points to by resolving it against the importing
// file's own path. Package imports such as "react-dom/server" do not start
// with "." and are never checked.

import path from 'node:path';

const srcDir = path.resolve(import.meta.dirname, '..', 'src');

const forbidden = {
  server: ['web'],
  web: ['server'],
  shared: ['server', 'web'],
};

/** Which top-level folder under src/ a file is in, or null if it is outside src/. */
function areaOf(filePath) {
  const relative = path.relative(srcDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  const area = relative.split(path.sep)[0];
  return area in forbidden ? area : null;
}

/** @type {import('eslint').Rule.RuleModule} */
export const importBoundary = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep src/server, src/web and src/shared apart: server and web may import shared, nothing else crosses.',
    },
    schema: [],
    messages: {
      crossed:
        'Import boundary: code in src/{{from}} may not import from src/{{to}}. Only src/shared is shared between server and web, and src/shared imports neither.',
    },
  },
  create(context) {
    const from = areaOf(context.filename);
    if (from === null) {
      return {};
    }

    function check(sourceNode) {
      if (
        !sourceNode ||
        sourceNode.type !== 'Literal' ||
        typeof sourceNode.value !== 'string'
      ) {
        return;
      }
      const specifier = sourceNode.value;
      if (!specifier.startsWith('.')) {
        return;
      }
      const target = path.resolve(path.dirname(context.filename), specifier);
      const to = areaOf(target);
      if (to !== null && forbidden[from].includes(to)) {
        context.report({
          node: sourceNode,
          messageId: 'crossed',
          data: { from, to },
        });
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};
