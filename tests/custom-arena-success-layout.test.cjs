const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const sass = require('sass');

test('market success separates the action from the copy without a nested card', () => {
  const css = sass.compile(resolve(__dirname, '../src/styles/modal.scss')).css;
  const rules = [...css.matchAll(/\.custom-arena-modal \.custom-arena-success\s*\{([^}]+)\}/g)]
    .map((match) => match[1]).join('\n');
  assert.match(rules, /display: flex/);
  assert.match(rules, /gap: 12px/);
  assert.match(rules, /background: transparent/);
  assert.match(css, /\.custom-arena-modal \.custom-arena-success \.confirm-button\s*\{[^}]*margin: 12px 0 0/s);
});
