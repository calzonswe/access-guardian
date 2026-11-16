process.env.DB_PASSWORD ??= 'test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { translate, requestLanguage } = await import('../src/services/i18n.js');
const EN = (await import('../src/services/i18n.en.js')).default;
const { buildHtml } = await import('../src/services/email.js');

test('exact messages translate, Swedish stays Swedish', () => {
  assert.equal(translate('Otillräckliga rättigheter', 'en'), 'You do not have permission to do this');
  assert.equal(translate('Otillräckliga rättigheter', 'sv'), 'Otillräckliga rättigheter');
});

test('messages with values translate through patterns', () => {
  assert.equal(translate('Max 500 rader per import', 'en'), 'At most 500 rows per import');
  assert.equal(translate('Din tillträdesansökan har nekats. Anledning: Behov saknas', 'en'),
    'Your access application has been denied. Reason: Behov saknas');
  assert.equal(translate('Åtkomst går ut om 7 dagar', 'en'), 'Access expires in 7 days');
  assert.equal(translate('Åtkomst går ut om 1 dag', 'en'), 'Access expires in 1 day');
});

test('values inside a message are translated when known', () => {
  assert.equal(translate('En tillträdesansökan har väntar på chef i 4 dagar.', 'en'),
    'An access application has been waiting for the manager for 4 days.');
  assert.equal(translate('Lösenordet måste innehålla stora bokstäver, siffror', 'en'),
    'The password must contain upper-case letters, digits');
});

test('unknown text passes through unchanged', () => {
  assert.equal(translate('Lager Nord', 'en'), 'Lager Nord');
});

test('every pattern key compiles and matches its own shape', () => {
  for (const key of Object.keys(EN).filter(k => /\{\w+\}/.test(k))) {
    const sample = key.replace(/\{\w+\}/g, 'X1');
    assert.notEqual(translate(sample, 'en'), sample, `pattern did not match: ${key}`);
  }
});

test('request language: user, then header, then Accept-Language', () => {
  assert.equal(requestLanguage({ user: { language: 'en' }, headers: {} }), 'en');
  assert.equal(requestLanguage({ headers: { 'x-language': 'en' } }), 'en');
  assert.equal(requestLanguage({ headers: { 'accept-language': 'en-GB,en;q=0.9' } }), 'en');
  assert.equal(requestLanguage({ headers: { 'accept-language': 'sv-SE' } }), 'sv');
});

test('e-mail template follows the language', () => {
  assert.match(buildHtml({ title: 'T', body: '<p>b</p>', lang: 'en' }), /automatic message, please do not reply/);
  assert.match(buildHtml({ title: 'T', body: '<p>b</p>' }), /automatiskt meddelande, svara ej/);
});
