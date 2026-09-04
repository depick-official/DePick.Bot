const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

function render(file, props, states, inspect = () => {}) {
  let index = 0;
  const source = readFileSync(resolve(__dirname, '../src/components', file), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (name) => {
      if (name === 'react') return { useState: (value) => [states ? states[index++] : value, () => {}], useEffect: () => {} };
      if (name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('/math')) return { formatNumber: String, formatToTwoDecimals: String };
      if (name === './CustomArenaMarketTerms') return { default: () => null };
      return {};
    },
  });
  const text = [];
  function visit(node) {
    if (typeof node === 'string' || typeof node === 'number') text.push(String(node));
    else if (React.isValidElement(node)) { inspect(node); React.Children.forEach(node.props.children, visit); }
  }
  visit(exports.default(props));
  return text.join(' ');
}
const market = { status: 'OPEN', odds: [.35, .65], collateralPick: 525, resolutionDeadline: '2026-09-09T00:00:00Z' };

test('only the information button toggles market details', () => {
  let clicked = false;
  const nodes = [];
  render('CustomArenaMarketCard.tsx', { market, showDetails: false, onToggleDetails: () => { clicked = true; } }, undefined, n => nodes.push(n));
  const info = nodes.find(n => n.props['aria-label'] === 'Show market details');
  assert.ok(info);
  assert.equal(info.props['aria-expanded'], false);
  info.props.onClick();
  assert.equal(clicked, true);
  assert.equal(nodes.find(n => n.props.className === 'custom-arena-card').props.onClick, undefined);
});
test('terms use headings and normal text without nested accordions', () => {
  const nodes = [];
  render('CustomArenaMarketTerms.tsx', { market }, undefined, n => nodes.push(n));
  assert.equal(nodes.some(n => n.type === 'details' || n.type === 'summary'), false);
  assert.equal(nodes.filter(n => n.type === 'h4').length, 2);
});
test('prediction confirmation no longer includes the terms component', () => {
  const nodes = [];
  render('CustomArenaPredictionModal.tsx', { market, initialOption: 0 }, undefined, n => nodes.push(n));
  assert.equal(nodes.some(n => typeof n.type === 'function'), false);
});

test('participant popup does not display prize pool or reserve', () => {
  const text = render('CustomArenaPredictionModal.tsx', { market, initialOption: 0 });
  assert.doesNotMatch(text, /Prize Pool|525|PICK reserve/);
});
test('reserve appears only in expanded moderator details', () => {
  for (const [showDetails, showReserve] of [[false, false], [true, false], [false, true], [true, true]]) {
    const text = render('CustomArenaMarketCard.tsx', { market, showDetails, showReserve });
    assert.equal(text.includes('525 PICK'), showDetails && showReserve);
    assert.equal(text.includes('PICK reserve'), showDetails && showReserve);
  }
});
test('unknown reserve is not shown as zero', () => {
  const text = render('CustomArenaMarketCard.tsx', { market: { ...market, collateralPick: undefined }, showDetails: true, showReserve: true });
  assert.match(text, /Unavailable/);
});

test('published terms display exact saved rules and void conditions', () => {
  const text = render('CustomArenaMarketTerms.tsx', { market: {
    resolutionRules: ['Yes if Arsenal wins in regular time.'],
    voidConditions: ['Void if this fixture is cancelled.'],
  } });
  assert.match(text, /Resolution rules/);
  assert.match(text, /Yes if Arsenal wins in regular time\./);
  assert.match(text, /Void conditions/);
  assert.match(text, /Void if this fixture is cancelled\./);
  assert.match(text, /holding position is refunded/);
  assert.match(text, /position fee is not refunded/);
});
test('missing published terms are disclosed without inventing conditions', () => {
  const text = render('CustomArenaMarketTerms.tsx', { market: {} });
  assert.match(text, /No resolution rules were recorded/);
  assert.match(text, /No separate void conditions were recorded/);
  assert.doesNotMatch(text, /Void if this fixture is cancelled/);
});

test('creation review displays frozen outcome semantics, details, and void terms', () => {
  const proposal = {
    question_text: 'Will City win?',
    yes_semantics: 'City wins at full time.',
    no_semantics: 'City draws or loses at full time.',
    resolution_rules: ['Regulation and stoppage time count.'],
    resolution_plan: { void_conditions: ['Void if the match is cancelled.', null, 42, ''] },
  };
  const text = render('CustomArenaCreateModal.tsx', { scope: {}, availableCapacityPick: 10000 }, [
    '', 'review', {}, proposal, null, '500',
  ]);
  for (const phrase of ['Resolves Yes when', proposal.yes_semantics, 'Resolves No when', proposal.no_semantics,
    'Resolution details', proposal.resolution_rules[0], 'Void conditions', proposal.resolution_plan.void_conditions[0]]) {
    assert.ok(text.includes(phrase), `Missing ${phrase}`);
  }
  assert.doesNotMatch(text, /42/);
});

test('creation review discloses missing terms without inventing settlement policy', () => {
  for (const resolution_plan of [undefined, null, {}, { void_conditions: 'invalid' }]) {
    const proposal = { question_text: 'Will City win?', resolution_plan };
    const text = render('CustomArenaCreateModal.tsx', { scope: {}, availableCapacityPick: 10000 }, [
      '', 'review', {}, proposal, null, '500',
    ]);
    assert.match(text, /No Yes settlement terms returned\./);
    assert.match(text, /No No settlement terms returned\./);
    assert.match(text, /No void conditions returned\./);
    assert.doesNotMatch(text, /cancelled|draws or loses/);
  }
});

test('creation review shows reserve allocation and remaining community capacity', () => {
  const proposal = { question_text: 'Question?', outcomes: ['Yes', 'No'] };
  const text = render('CustomArenaCreateModal.tsx', { communityId: 'community', scope: {}, availableCapacityPick: 10000 }, [
    'Question?', 'review', { marketId: 'draft', proposal, initial_odds: { p_yes: .35, p_no: .65 } }, proposal, null, '500',
  ]);
  assert.match(text, /PICK reserve to allocate/);
  assert.match(text, /9,500/);
  assert.doesNotMatch(text, /525/);
});
