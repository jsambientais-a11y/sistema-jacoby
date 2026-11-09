import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const {outputText}=ts.transpileModule(readFileSync(new URL('../src/lib/billing-flow-navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {bulletinBillingEntries:entriesFor,selectBulletinBillingEntry:select,summarizeBulletinBilling:summary,hasBillingInvoiceIssue:hasInvoice}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const entry=(id,cycleId,category,amount=0,extra={})=>({id,cycleId,category,company:'Empresa',currentCommission:amount,...extra});
test('filtro de NF usa a emissão salva, respeita limpeza intencional e mantém compatibilidade com registros antigos',()=>{
 assert.equal(hasInvoice(entry('old','a','service',0,{legacyIssuedOn:'2026-11-01'})),true);
 assert.equal(hasInvoice(entry('new','a','service',0,{tracking:{invoice_issued_on:'2026-11-02'}})),true);
 assert.equal(hasInvoice(entry('cleared','a','service',0,{legacyIssuedOn:'2026-11-01',tracking:{invoice_issued_on:null}})),false);
 assert.equal(hasInvoice(entry('number-only','a','service',0,{tracking:{invoice_number:'123',invoice_issued_on:null}})),false);
 assert.equal(hasInvoice(entry('none','a','service')),false);
});
test('qualquer BM mantém suas categorias e nunca recebe lançamentos de outro UUID, mesmo com número igual',()=>{
 const rows=[entry('a-rent','a','rental'),entry('b-rent','b','rental'),entry('a-treatment','a','treatment'),entry('a-exchange','a','exchange')];
 for(const cycle of ['a','b']) assert.ok(entriesFor(rows,cycle).every(e=>e.cycleId===cycle));
 assert.deepEqual(entriesFor(rows,'a').map(e=>e.category),['rental','exchange','treatment']);
 assert.deepEqual(entriesFor(rows,'unknown'),[]);
});
test('ao abrir BM prefere a categoria do filtro, mas mantém todas as demais para alternar',()=>{
 const rows=entriesFor([entry('t','a','treatment'),entry('r','a','rental'),entry('e','a','exchange')],'a');
 assert.equal(select(rows,'','treatment').id,'t');
 assert.equal(select(rows,'e','rental').id,'e');
 assert.equal(rows.length,3);
});
test('link do mapa para item inexistente não abre outro lançamento por engano',()=>{
 const rows=[entry('r','a','rental')];
 assert.equal(select(rows,'missing','rental',true),undefined);
 assert.equal(select(rows,'r','rental',true).id,'r');
});
test('categorias de várias empresas continuam selecionáveis separadamente no mesmo BM',()=>{
 const rows=entriesFor([entry('s2','a','service',10,{company:'Zeta'}),entry('s1','a','service',20,{company:'Alfa'})],'a');
 assert.deepEqual(rows.map(e=>e.id),['s1','s2']);assert.equal(select(rows,'s2','service').id,'s2');
});
test('resumo usa comissão conferida, não o líquido da nota nem o valor bruto do BM',()=>{
 const rows=[entry('r','a','rental',0.1),entry('e','a','exchange',0.2),entry('t','a','treatment',999,{tracking:{commission_amount:30,net_invoice_amount:10000}})];
 const before=structuredClone(rows);const s=summary(rows);
 assert.equal(s.total,30.3);assert.equal(s.confirmed,1);assert.equal(s.provisional,true);assert.deepEqual(rows,before);
});
