const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

function harness(regular = false) {
  const states = regular ? ['HOME', 50, false, false, 'user', 500] : [0, 50, false, false, 500];
  const effects = [];
  const timers = [];
  const calls = [];
  let index = 0;
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components', regular ? 'PredictionModal.tsx' : 'CustomArenaPredictionModal.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, console, setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    require: (name) => {
      if (name === 'react') return {
        useState: (initial) => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (v) => { states[i] = v; }]; },
        useEffect: (fn) => effects.push(fn),
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('/math')) return { formatNumber: String, formatToTwoDecimals: String };
      if (name === './CustomArenaMarketTerms') return { default: () => null };
      if (name.endsWith('/PredictionRecord')) return { SelectedTeam: { HOME: 'HOME', AWAY: 'AWAY', TIE: 'TIE' } };
      if (name === './QuoteLoading') return { default: () => React.createElement('span', { role: 'status' }, 'Loading quote') };
      if (name.endsWith('/api')) {
        const api = { getQuote: (...args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject })) };
        return { customArenaApi: api, predictionApi: api };
      }
      return {};
    },
  });
  function render() {
    index = 0; effects.length = 0;
    const nodes = [], text = [];
    function visit(n) { if (React.isValidElement(n)) { if (typeof n.type === 'function') { visit(n.type(n.props)); return; } nodes.push(n); React.Children.forEach(n.props.children, visit); } else if (typeof n === 'string' || typeof n === 'number') text.push(n); }
    visit(exports.default({ market: { id: 'market', odds: [.35, .65] }, match: { id: 'match', homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' } }, initialOption: 0 }));
    return { text: text.join(' '), confirm: nodes.find(n => n.props.className === 'confirm-button') };
  }
  return { states, effects, timers, calls, render };
}
const quote = { fee: 1, netStake: 49, sharesOut: 129, avgEntryPrice: .38, potentialPayout: 129, mmType: 'LMSR' };
for (const regular of [false, true]) {
  test(`${regular ? 'regular' : 'custom arena'} shows loading until a matching quote arrives`, async () => {
    const h = harness(regular);
    assert.match(h.render().text, /Loading quote/);
    assert.equal(h.render().confirm.props.disabled, true);
    h.effects[1]();
    const pending = h.timers.shift()();
    h.calls[0].resolve(quote); await pending;
    assert.doesNotMatch(h.render().text, /Loading quote/);
    assert.equal(h.render().confirm.props.disabled, false);
    h.states[1] = 75;
    assert.match(h.render().text, /Loading quote/);
    assert.doesNotMatch(h.render().text, /129 PICK/);
    h.effects[1]();
    const failed = h.timers.shift()();
    h.calls[1].reject(new Error('offline')); await failed;
    assert.doesNotMatch(h.render().text, /Loading quote/);
    assert.match(h.render().text, /Unable to load quote/);
    assert.equal(h.render().confirm.props.disabled, true);
    h.states[1] = 0;
    assert.doesNotMatch(h.render().text, /Loading quote/);
  });
}
test('waits for a matching chain quote and displays only payout and average price', async () => {
  const h = harness();
  assert.equal(h.render().confirm.props.disabled, true);
  h.effects[1]();
  const pending = h.timers.shift()();
  assert.deepEqual(h.calls[0].args, ['market', 0, 50]);
  h.calls[0].resolve(quote); await pending;
  const view = h.render();
  assert.equal(view.confirm.props.disabled, false);
  assert.match(view.text, /To Win:/);
  assert.match(view.text, /129 PICK/);
  assert.match(view.text, /Avg\. Price:\s+38\s/);
  assert.doesNotMatch(view.text, /Avg\. Price:\s+38%/);
  assert.doesNotMatch(view.text, /Position fee:|Estimated total payout|quote may change/);
  h.states[1] = 100;
  const changed = h.render();
  assert.equal(changed.confirm.props.disabled, true);
  assert.doesNotMatch(changed.text, /129 PICK/);
});
test('ignores cancelled requests and disables confirmation after quote failure', async () => {
  const h = harness(); h.render();
  const cleanup = h.effects[1]();
  const old = h.timers.shift()(); cleanup();
  h.calls[0].resolve(quote); await old;
  assert.equal(h.render().confirm.props.disabled, true);
  h.effects[1](); const pending = h.timers.shift()();
  h.calls[1].reject(new Error('offline')); await pending;
  const view = h.render();
  assert.equal(view.confirm.props.disabled, true);
  assert.match(view.text, /Unable to load quote/);
});
