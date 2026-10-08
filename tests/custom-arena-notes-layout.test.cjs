const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const sass = require('sass');

test('market notes do not inherit metadata emphasis or block-level bold text', () => {
  const css = sass.compile(resolve(__dirname, '../src/styles/pages.scss')).css;
  assert.doesNotMatch(css, /\.custom-arena-market-details strong\s*\{/);
  assert.match(css, /\.custom-arena-market-details > div > strong\s*\{/);
  assert.match(css, /\.custom-arena-market-details p\s*\{[^}]*color: #cac5d6/s);
  assert.match(css, /\.custom-arena-market-details \.custom-arena-refund-note\s*\{[^}]*margin-top: 16px/s);
});
