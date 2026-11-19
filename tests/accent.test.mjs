// A church's colour and the shades made from it (lib/accent.ts). The same rules run
// in the dashboard's preview and in both phone apps. Run with `npm test`.
// The body of this file is the same in all three projects (tests/accent.test.ts on the website).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ACCENT, DEFAULT_COLOR, accentFrom, contrast, isDarkened, normalizeHex } from '../lib/accent.ts';

const WHITE = '#ffffff';
const PAGE = '#f5f5f7';
const SAMPLES = [
  '#0f766e', // teal
  '#1e3a8a', // navy
  '#b91c1c', // red
  '#ffd60a', // bright yellow
  '#ffffff', // white
  '#000000', // black
  '#ff8fab', // light pink
  '#d1d5db', // light grey
  '#7c3aed', // purple
  '#00ff00', // pure green
];

test('no colour, nonsense and the standard blue all give the standard shades', () => {
  assert.deepEqual(DEFAULT_ACCENT, {
    azure: '#0071e3',
    azureText: '#0066cc',
    azureTint: '#e6f0fc',
    azureTintText: '#0058b0',
  });
  for (const value of [null, undefined, '', '   ', 'blue', '#12', '#12345', '#gggggg', 7, {}, DEFAULT_COLOR, '#0071E3', '0071e3']) {
    assert.equal(accentFrom(value), DEFAULT_ACCENT);
  }
});

test('a hex code is read with or without "#", in either case, short or long', () => {
  assert.equal(normalizeHex('#0F766E'), '#0f766e');
  assert.equal(normalizeHex('0f766e'), '#0f766e');
  assert.equal(normalizeHex('  #0f766e  '), '#0f766e');
  assert.equal(normalizeHex('#abc'), '#aabbcc');
  assert.equal(normalizeHex('ABC'), '#aabbcc');
  for (const bad of ['', '#', '#abcd', '#abcdefg', 'teal', 'rgb(0,0,0)', null, undefined, 123456]) {
    assert.equal(normalizeHex(bad), null);
  }
});

test('a colour that is dark enough is used exactly as picked', () => {
  assert.equal(accentFrom('#0f766e').azure, '#0f766e');
  assert.equal(accentFrom('#0F766E').azure, '#0f766e');
  assert.equal(accentFrom('#1e3a8a').azure, '#1e3a8a');
  assert.equal(isDarkened('#0f766e'), false);
  assert.equal(isDarkened(DEFAULT_COLOR), false);
  assert.equal(isDarkened('not a colour'), false);
});

test('a colour too light for white text is darkened, and keeps its own hue', () => {
  const yellow = accentFrom('#ffd60a');
  assert.notEqual(yellow.azure, '#ffd60a');
  assert.equal(isDarkened('#ffd60a'), true);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(yellow.azure.slice(i, i + 2), 16));
  assert.ok(r > g && g > b, `still a yellow: ${yellow.azure}`);
});

test('every shade is readable, whatever colour is picked', () => {
  for (const sample of SAMPLES) {
    const a = accentFrom(sample);
    for (const shade of Object.values(a)) assert.match(shade, /^#[0-9a-f]{6}$/, `${sample} -> ${shade}`);
    assert.ok(contrast(a.azure, WHITE) >= 4.5, `${sample}: white text on ${a.azure}`);
    assert.ok(contrast(a.azureText, PAGE) >= 5, `${sample}: ${a.azureText} on the page`);
    assert.ok(contrast(a.azureTintText, a.azureTint) >= 5.5, `${sample}: ${a.azureTintText} on ${a.azureTint}`);
  }
});

test('the wash is pale, but can be seen on a white card', () => {
  for (const sample of SAMPLES) {
    const { azureTint } = accentFrom(sample);
    const seen = contrast(azureTint, WHITE);
    assert.ok(seen >= 1.12, `${sample}: ${azureTint} is too close to white (${seen.toFixed(2)})`);
    assert.ok(seen <= 1.9, `${sample}: ${azureTint} is too dark for a wash (${seen.toFixed(2)})`);
  }
});

test('the same colour always gives the same shades', () => {
  assert.deepEqual(accentFrom('#0f766e'), accentFrom('0F766E'));
  assert.deepEqual(accentFrom('#abc'), accentFrom('#aabbcc'));
});

test('contrast is 21 for black on white and 1 for a colour on itself', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#0f766e', '#0f766e'), 1);
});
