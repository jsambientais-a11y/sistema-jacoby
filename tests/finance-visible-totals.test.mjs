import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const {outputText}=ts.transpileModule(readFileSync(new URL('../src/lib/finance-visible-totals.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {financeVisibleTotals:sum}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const row=(id,base,amount,extra={})=>({id,source:'billing',billingIssuer:{id:'outsourced:a'},amountCents:amount,calculationDetail:{baseCents:base},...extra});
test('soma visível preserva bases repetidas de categorias distintas, zero, ausências e comissão uma vez',()=>{
 const rows=[row('rental',100000,10000),row('exchange',100000,20000,{provisional:true}),row('zero',0,500),row('fixed',null,700),row('manual',undefined,800,{source:'manual'}),row('jacoby',20000,20000,{billingIssuer:{id:'jacoby'}})];
 assert.deepEqual(sum(rows),{baseCents:220000,missingBases:2,estimatedBases:1,commissionCents:31200,estimatedCommissionCents:20000,otherIncomeCents:20800,totalCents:52000});
 assert.equal(sum(rows.filter(r=>r.id==='rental')).totalCents,10000);
 assert.equal(sum(rows.filter(r=>r.source==='manual')).baseCents,0);
 assert.equal(sum([]).totalCents,0);
});
