const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const sass = require('sass');

test('creation outcome semantics use the same text treatment as resolution details', () => {
  const css = sass.compile(resolve(__dirname, '../src/styles/modal.scss')).css;
  assert.match(css, /\.custom-arena-modal \.custom-arena-rules > p\s*\{[^}]*color: #f1eef8/s);
});

test('normal-user Custom Arena buttons match the regular prediction primary button', () => {
  const page = readFileSync(resolve(__dirname, '../src/pages/CustomArenaPage.tsx'), 'utf8');
  const css = sass.compile(resolve(__dirname, '../src/styles/pages.scss')).css;
  assert.match(page, /className="container custom-arena-page"/);
  assert.match(css, /\.custom-arena-page \.custom-arena-choice-button,[^{]*\.custom-arena-page \.custom-arena-actions button\s*\{[^}]*box-shadow: 0px 4px 10px rgba\(255, 171, 56, 0\.4\)[^}]*color: #fafafa/s);
});
