import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source=ts.transpileModule(readFileSync(new URL("../src/lib/billing-receivable-groups.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {groupReceivablesByBulletin:group}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const row=(id,amount,extra={})=>({id,amount,status:"upcoming",confirmed:true,expectedOn:"2026-11-25",receivedOn:null,entry:{cycleId:"cycle1",bulletin:"#227",client:"Cliente A",branch:"Matriz",companyId:"company1",category:id,company:"Terceirizada",tracking:{net_invoice_amount:5000}},...extra});
test("uma linha por UUID do BM soma recebíveis, sem repetir líquido de nota compartilhada",()=>{
  const [bm]=group([row("treatment",153.42),row("exchange",183.64),row("rental",238.85)]);
  assert.equal(bm.total,575.91);assert.equal(bm.remaining,575.91);assert.equal(bm.received,0);
  assert.equal(bm.rows.length,3);assert.equal(bm.confirmed,true);
});
test("mesmo BM com duas empresas fica junto; mesmo número em UUID diferente continua separado",()=>{
  const a=row("a",100),b=row("b",200,{entry:{...row("b",0).entry,companyId:"another"}});
  const c=row("c",300,{entry:{...row("c",0).entry,cycleId:"cycle2",client:"Cliente B"}});
  const groups=group([a,b,c]);assert.equal(groups.length,2);
  assert.equal(groups.find(g=>g.cycleId==="cycle1").total,300);
  assert.equal(groups.find(g=>g.cycleId==="cycle2").client,"Cliente B");
});
test("recebimento parcial conserva total, saldo, situação vencida e datas de cada origem",()=>{
  const [bm]=group([row("paid",100,{status:"received",receivedOn:"2026-11-01"}),row("due",200,{status:"overdue",expectedOn:"2026-11-05"}),row("later",50,{expectedOn:"2026-12-10"})]);
  assert.equal(bm.total,350);assert.equal(bm.received,100);assert.equal(bm.remaining,250);
  assert.equal(bm.partiallyReceived,true);assert.equal(bm.status,"overdue");
  assert.deepEqual(bm.expectedDates,["2026-11-05","2026-12-10"]);
  assert.deepEqual(bm.receivedDates,["2026-11-01"]);
});
test("categorias zeradas não mantêm BM pago em aberto; mantém indicação de valor provisório",()=>{
  const [bm]=group([row("paid",100,{status:"received",receivedOn:"2026-11-01"}),row("zero",0,{status:"no_date",confirmed:false,expectedOn:null})]);
  assert.equal(bm.status,"received");assert.equal(bm.remaining,0);assert.equal(bm.confirmed,false);
  assert.equal(bm.partiallyReceived,false);
});
test("IDs repetidos não duplicam valor e o agrupamento não modifica os lançamentos",()=>{
  const input=[row("a",0.1),row("b",0.2)];const before=structuredClone(input);
  const [bm]=group([...input,input[0]]);assert.equal(bm.total,0.3);assert.equal(bm.rows.length,2);
  assert.deepEqual(input,before);
});
test("ao localizar BM por uma origem, apresentação ainda usa todos os recebíveis desse BM",()=>{
  const input=[row("service",100),row("treatment",200)];
  const matchingCycles=new Set(input.filter(r=>r.id==="service").map(r=>r.entry.cycleId));
  const shown=group(input).filter(g=>matchingCycles.has(g.cycleId));
  assert.equal(shown[0].total,300);assert.equal(shown[0].rows.length,2);
});
test("ordena por urgência do BM, data e valor, sem marcar recebido apenas porque uma origem foi baixada",()=>{
  const paid=row("p",300,{status:"received",receivedOn:"2026-11-02",entry:{...row("p",0).entry,cycleId:"paid"}});
  const overdue=row("v",50,{status:"overdue",expectedOn:"2026-11-01",entry:{...row("v",0).entry,cycleId:"late"}});
  const groups=group([paid,row("open",30),overdue]);
  assert.deepEqual(groups.map(g=>g.cycleId),["late","cycle1","paid"]);
});
