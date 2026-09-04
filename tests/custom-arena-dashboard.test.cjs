const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const community = {
  id: 'community-1', displayName: 'Pilot', channels: [
    { scopeProvider: 'TELEGRAM', scopeExternalId: '-1001', displayName: 'Pilot' },
    { scopeProvider: 'DISCORD', scopeExternalId: '123', displayName: 'Pilot' },
  ],
};
const dashboard = {
  community, capacity: { availablePick: '10000', totalPick: '10000', reservedPick: '0' },
  counts: { active: 0, awaitingResolution: 0, onHold: 0, resolved: 0, void: 0 },
  volumePick: '0', participantCount: 0, markets: [],
};

// Render the page's element tree in a specified request state, without browser or API calls.
function render({ loading = false, selectedId = community.id } = {}) {
  const states = [
    [community], selectedId, null, 'active', dashboard, false, loading, null,
    0, false, null, null, null,
  ];
  let index = 0;
  const hooks = {
    useState: () => [states[index++], () => {}],
    useEffect: () => {},
    useMemo: (calculate) => calculate(),
  };
  const source = readFileSync(resolve(__dirname, '../src/pages/CustomArenaDashboardPage.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, URLSearchParams,
    require: (name) => {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-router-dom') return { useSearchParams: () => [new URLSearchParams()] };
      if (name.endsWith('.scss')) return {};
      return { default: () => null };
    },
  });
  const nodes = [];
  function visit(node) {
    if (!React.isValidElement(node)) return;
    nodes.push(node);
    React.Children.forEach(node.props.children, visit);
  }
  visit(exports.default());
  return nodes;
}

test('channel options distinguish Telegram from Discord', () => {
  const options = render().filter((node) => node.type === 'option');
  const labels = options.map((node) => React.Children.toArray(node.props.children).join(''));
  assert.ok(labels.some((label) => label.includes('Telegram') && label.includes('Pilot')));
  assert.ok(labels.some((label) => label.includes('Discord') && label.includes('Pilot')));
});

test('status requests keep the summary and filters mounted, with loading only inside markets', () => {
  const nodes = render({ loading: true });
  assert.ok(nodes.some((node) => node.props['aria-label'] === 'Community summary'));
  assert.ok(nodes.some((node) => node.props['aria-label'] === 'Market status filters'));
  const markets = nodes.find((node) => node.props['aria-label'] === 'Community markets');
  assert.equal(markets?.props['aria-busy'], true);
  assert.ok(nodes.some((node) => node.props.role === 'status' && node.props.children === 'Loading markets...'));
});

test('switching communities does not show the previous community summary', () => {
  const nodes = render({ loading: true, selectedId: 'community-2' });
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Community summary'), false);
});
