import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const urls = {};
for (const name of ['billing-agreement','billing-dates','billing-flow-navigation','billing-group-editor']) {
 let {outputText} = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
 for (const [dependency,url] of Object.entries(urls)) outputText=outputText.replaceAll(`"./${dependency}"`,JSON.stringify(url));
 urls[name]=`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const {createBillingRow:row,commonBillingFields:common,prepareBillingGroupSave:prepare}=await import(urls['billing-group-editor']);
const {isBillingInvoicePending:pending,billingEntryHasCharge:hasCharge}=await import(urls['billing-flow-navigation']);
const today='2026-11-08';
const entry=(id,category,extra={})=>({id,cycleId:'bm155',companyId:'ldj',company:'LDJ',category,description:category,baseAmount:100,currentCommission:10,itemsCount:1,...extra});
const saved=(extra={})=>({rule_type:'fixed',rule_value:10,commission_amount:10,net_invoice_amount:null,invoice_number:'11',invoice_issued_on:'2026-11-04',invoice_due_on:'2026-11-19',expected_basis:'issue',expected_on:'2026-11-25',received_on:null,notes:null,...extra});
const rows=(entries)=>Object.fromEntries(entries.map(e=>[e.id,row(e)]));
test('BM 155 só locação cobrada: troca/tratamento/serviços zerados não geram NF pendente nem novos registros',()=>{
 const rent=entry('rent','rental',{tracking:saved()});
 const zero=['exchange','treatment','service'].map((cat)=>entry(cat,cat,{baseAmount:0,currentCommission:0}));
 assert.equal(pending(rent),false);
 for(const e of zero){assert.equal(pending(e),false); assert.equal(row(e).selected,false);}
 const entries=[rent,...zero], c=common(entries);
 assert.deepEqual(prepare(entries,rows(entries),c.fields,new Set(),today),[]);
 assert.equal(pending(entry('charged','exchange')),true);
 const zeroAgreement=entry('explicit-zero','exchange',{baseAmount:1900,currentCommission:100,tracking:saved({rule_value:0,commission_amount:0,net_invoice_amount:0,invoice_issued_on:null})});
 assert.equal(pending(zeroAgreement),false);assert.equal(row(zeroAgreement).selected,false);
});
test('nota anexada sem valor continua a conferir; comissão zero com cobrança no BM não é ignorada',()=>{
 assert.equal(pending(entry('pending','service',{pendingService:true,baseAmount:0,currentCommission:0})),true);
 assert.equal(hasCharge(entry('charged','rental',{baseAmount:100,currentCommission:0})),true);
});
test('líquido manual por categoria: nota compartilhada não multiplica o total nos percentuais',()=>{
 const entries=[entry('a','rental'),entry('b','treatment')], r=rows(entries), c=common(entries);
 r.a={selected:true,rule:'percent',value:'5',net:'1000'};
 r.b={selected:true,rule:'percent',value:'10',net:'500'};
 Object.assign(c.fields,{invoice_number:'123',invoice_issued_on:'2026-11-01',expected_basis:'issue_15'});
 const payload=prepare(entries,r,c.fields,new Set(['invoice_number','invoice_issued_on','expected_basis']),today);
 assert.deepEqual(payload.map(p=>p.net_invoice_amount),[1000,500]);
 assert.ok(payload.every(p=>p.invoice_number==='123' && p.expected_on==='2026-11-16' && p.received_on===null));
 assert.equal(payload.reduce((sum,p)=>sum+p.rule_value*p.net_invoice_amount/100,0),100);
});
test('datas/notas diferentes permanecem por linha ao alterar somente uma comissão',()=>{
 const entries=[entry('a','rental',{tracking:saved()}),entry('b','exchange',{tracking:saved({invoice_number:'22',invoice_issued_on:'2026-10-02',expected_on:'2026-12-01',notes:'Acordo antigo'})})];
 const before=structuredClone(entries), r=rows(entries), c=common(entries);
 assert.ok(c.mixed.has('invoice_number')); assert.ok(c.mixed.has('expected_on'));
 r.b.value='15';
 const payload=prepare(entries,r,c.fields,new Set(),today);
 assert.equal(payload.length,1); assert.equal(payload[0].invoice_number,'22');
 assert.equal(payload[0].invoice_issued_on,'2026-10-02'); assert.equal(payload[0].expected_on,'2026-12-01');
 assert.equal(payload[0].notes,'Acordo antigo'); assert.deepEqual(entries,before);
});
test('campo compartilhado altera só o que foi editado nas linhas selecionadas',()=>{
 const entries=[entry('a','rental',{tracking:saved()}),entry('b','exchange',{tracking:saved({invoice_number:'22'})})];
 const r=rows(entries), c=common(entries);r.b.selected=false;c.fields.invoice_number='33';
 const payload=prepare(entries,r,c.fields,new Set(['invoice_number']),today);
 assert.equal(payload.length,1);assert.equal(payload[0].entry.id,'a');assert.equal(payload[0].invoice_number,'33');
 assert.equal(payload[0].expected_on,'2026-11-25');assert.equal(payload[0].received_on,null);
});
test('redigitar a mesma data ou selecionar a mesma regra não recalcula previsão antiga',()=>{
 const entries=[entry('a','rental',{tracking:saved()})], r=rows(entries), c=common(entries);
 r.a.value='20';
 const payload=prepare(entries,r,c.fields,new Set(['invoice_issued_on','expected_basis']),today);
 assert.equal(payload[0].expected_on,'2026-11-25');
 c.fields.invoice_issued_on='2026-11-05';
 const changed=prepare(entries,r,c.fields,new Set(['invoice_issued_on']),today);
 assert.equal(changed[0].expected_on,'2026-12-10');
});
test('previsão manual opcional e recebimento futuro são validados sem baixa automática',()=>{
 const entries=[entry('a','exchange')], r=rows(entries), c=common(entries);r.a.value='100';
 c.fields.expected_basis='manual';
 assert.throws(()=>prepare(entries,r,c.fields,new Set(['expected_basis']),today),/previsão manual/);
 c.fields.expected_on='2026-11-25';
 let payload=prepare(entries,r,c.fields,new Set(['expected_basis','expected_on']),today);
 assert.equal(payload[0].expected_on,'2026-11-25');assert.equal(payload[0].received_on,null);
 c.fields.received_on='2026-12-01';
 assert.throws(()=>prepare(entries,r,c.fields,new Set(['expected_basis','expected_on','received_on']),today),/futuro/);
});
test('recusa emissores/BMs diferentes e qualquer percentual sem líquido antes de gravar',()=>{
 const entries=[entry('a','rental'),entry('b','service',{companyId:'cortes'})], c=common(entries);
 assert.throws(()=>prepare(entries,rows(entries),c.fields,new Set(),today),/separadamente/);
 const same=[entry('a','rental'),entry('b','treatment')], r=rows(same);r.a.value='10';r.b.rule='percent';r.b.value='5';
 assert.throws(()=>prepare(same,r,common(same).fields,new Set(),today),/líquido/);
});
