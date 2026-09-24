import globals from 'globals';

/**
 * Watch code runs on the lite wearable JS engine (JerryScript). Only a conservative
 * subset is allowed: ES5 + let/const, arrow functions, template literals and ES modules.
 * ecmaVersion 2015 already rejects async/await, **, ?. and ??; the rules below also ban
 * ES2015 features whose lite support is unverified, plus ES2015+ built-ins.
 */
const LITE_RESTRICTED_SYNTAX = [
  { selector: 'ClassDeclaration', message: 'class is not guaranteed on lite JS; use factory functions.' },
  { selector: 'ClassExpression', message: 'class is not guaranteed on lite JS; use factory functions.' },
  { selector: 'SpreadElement', message: 'Spread is not guaranteed on lite JS.' },
  { selector: 'RestElement', message: 'Rest parameters/destructuring are not guaranteed on lite JS.' },
  { selector: 'ObjectPattern', message: 'Destructuring is not guaranteed on lite JS.' },
  { selector: 'ArrayPattern', message: 'Destructuring is not guaranteed on lite JS.' },
  { selector: 'AssignmentPattern', message: 'Default parameters are not guaranteed on lite JS.' },
  { selector: 'ForOfStatement', message: 'for...of needs iterators; use an indexed loop.' },
  { selector: 'FunctionDeclaration[generator=true]', message: 'Generators are not supported on lite JS.' },
  { selector: 'FunctionExpression[generator=true]', message: 'Generators are not supported on lite JS.' },
  { selector: 'NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet|Promise|Proxy|Symbol)$/]', message: 'ES2015+ built-in: not guaranteed on lite JS.' },
  // The watch compiles JS to JerryScript bytecode at install time without RegExp support:
  // any regex fails the install with error 34 (TRANSFORM_BC_FILE_ERROR).
  { selector: 'Literal[regex]', message: 'No RegExp on the watch (install error 34); use indexOf/charCodeAt loops.' },
  { selector: 'NewExpression[callee.name="RegExp"]', message: 'No RegExp on the watch (install error 34).' },
  { selector: 'CallExpression[callee.name="RegExp"]', message: 'No RegExp on the watch (install error 34).' }
];

const ES2015_BUILTINS = [
  ['Object', 'assign'], ['Object', 'entries'], ['Object', 'values'],
  ['Array', 'from'], ['Array', 'of'],
  ['Math', 'imul'], ['Math', 'hypot'], ['Math', 'sign'], ['Math', 'trunc'], ['Math', 'log10'],
  ['Number', 'isFinite'], ['Number', 'isNaN'], ['Number', 'isInteger']
].map(function (pair) {
  return { object: pair[0], property: pair[1], message: 'ES2015+ built-in: not guaranteed on lite JS.' };
});

const ES2015_METHODS = ['includes', 'find', 'findIndex', 'fill', 'padStart', 'padEnd', 'startsWith', 'endsWith', 'repeat']
  .map(function (name) {
    return { property: name, message: 'ES2015+ method: not guaranteed on lite JS.' };
  });

export default [
  {
    ignores: ['node_modules/**', '**/build/**', 'oh_modules/**', '.hvigor/**', 'coverage/**']
  },
  {
    files: ['entry/src/main/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2015,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        isFinite: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-restricted-syntax': ['error'].concat(LITE_RESTRICTED_SYNTAX),
      'no-restricted-properties': ['error'].concat(ES2015_BUILTINS, ES2015_METHODS)
    }
  },
  {
    files: ['tests/**/*.js', 'tools/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: Object.assign({}, globals.node, globals.jest)
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    files: ['tools/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'commonjs' }
  }
];
