import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/billing-agreement.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { billingAgreement, billingCommission } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('Cortes calcula sobre líquido da NF, sem segundo abatimento de imposto', () => {
  const rule = billingAgreement({ companyId: 'cortes', company: 'AFONSO & AFONSO - CORTES', description: 'Serviço' });
  assert.equal(rule.defaultRule, 'percent');
  assert.equal(rule.requiresAgreement, true);
  // BM de R$ 1.000, NF líquida de R$ 850 e acordo de 10% = R$ 85.
  assert.equal(billingCommission('percent', 10, 850), 85);
  assert.equal(billingCommission('percent', 10, null), null);
  assert.equal(billingCommission('percent', 10, 0), 0);
});

test('LDJ e sucata não recebem um percentual presumido', () => {
  for (const entry of [
    { companyId: 'ldj', company: 'LDJ Ambiental', description: 'Locação' },
    { companyId: 'eliana', company: 'Eliana', description: 'Tratamento de sucata' },
  ]) {
    assert.equal(billingAgreement(entry).defaultRule, 'fixed');
    assert.equal(billingAgreement(entry).requiresAgreement, true);
  }
  assert.equal(billingCommission('fixed', 237.5, null), 237.5);
  assert.equal(billingCommission('percent', 5, 800), 40);
});

test('valida limites e arredonda em centavos', () => {
  assert.equal(billingCommission('percent', 101, 1000), null);
  assert.equal(billingCommission('fixed', -1, null), null);
  assert.equal(billingCommission('percent', 10, -1), null);
  assert.equal(billingCommission('percent', 10, NaN), null);
  assert.equal(billingCommission('fixed', NaN, null), null);
  assert.equal(billingCommission('percent', 12.5, 123.45), 15.43);
});
