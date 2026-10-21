import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/billing-bulletins.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { sortBillingBulletins } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const bm = (id, number, emittedAt) => ({id,number,emittedAt,client:'Cliente',branch:'Matriz',company:'Jacoby'});
test('ordena pela emissão real, independentemente do número e do fuso do timestamp', () => {
 const rows = [bm('alto',211,'2026-10-01T10:00:00Z'),bm('recente',5,'2026-10-21T08:00:00-03:00'),bm('outro',180,'2026-10-21T10:59:00Z')];
 assert.deepEqual(sortBillingBulletins(rows).map(b=>b.id),['recente','outro','alto']);
 assert.deepEqual(rows.map(b=>b.id),['alto','recente','outro']);
});
test('datas ausentes ficam no fim e empates têm ordem estável por número', () => {
 const rows = [bm('ausente',999,null),bm('b',2,'2026-10-21T10:00:00Z'),bm('a',10,'2026-10-21T10:00:00Z'),bm('invalida',1,'invalida')];
 assert.deepEqual(sortBillingBulletins(rows).map(b=>b.id),['a','b','ausente','invalida']);
});
