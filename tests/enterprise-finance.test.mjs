import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/lib/enterprise-finance.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseFinanceMoney,summarizeFinance,manualFinanceRow,financeStatus}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('valores BRL são convertidos para centavos sem arredondamento flutuante',()=>{assert.equal(parseFinanceMoney('1.500,25'),150025);assert.equal(parseFinanceMoney('0,01'),1);assert.equal(parseFinanceMoney(' R$ 10,5 '),1050);for(const bad of ['','0','-1','1,001','1.5','Infinity','10000000001'])assert.throws(()=>parseFinanceMoney(bad));});
const row=(kind,amount,settled=false)=>({id:crypto.randomUUID(),kind,amountCents:amount,settledOn:settled?'2026-10-30':null,dueOn:'2026-10-31',source:'manual',description:'Teste',counterparty:'',category:'',canSettle:true});
test('comparativo inclui cada receita/despesa uma vez e separa realizado de previsto',()=>{
 const rows=[row('receivable',150000,true),row('receivable',50000),row('payable',70000,true),row('payable',30000)];
 assert.deepEqual(summarizeFinance(rows),{expectedIn:200000,expectedOut:100000,received:150000,paid:70000,openIn:50000,openOut:30000,expectedNet:100000,realizedNet:80000});assert.equal(summarizeFinance([]).expectedNet,0);
});
test('vencimento é independente da situação paga e receita sem data não inventa previsão',()=>{const r=row('payable',1000);assert.equal(financeStatus(r,'2026-11-01'),'Vencido');r.settledOn='2026-10-30';assert.equal(financeStatus(r,'2026-11-01'),'Pago');r.kind='receivable';assert.equal(financeStatus(r,'2026-11-01'),'Recebido');r.settledOn=null;r.dueOn=null;assert.equal(financeStatus(r,'2026-11-01'),'Sem previsão');});
test('identidade manual não colide com faturamento e o cadastro original é preservado',()=>{const original={id:'x',kind:'payable',description:'Aluguel',counterparty:'Fornecedor',category:'Operação',amount_cents:150000,due_on:'2026-10-31',settled_on:null,notes:'',deleted_at:null,updated_at:'now'};const r=manualFinanceRow(original);assert.equal(r.id,'manual:x');assert.equal(r.amountCents,150000);assert.equal(r.source,'manual');assert.equal(r.manual,original);});
