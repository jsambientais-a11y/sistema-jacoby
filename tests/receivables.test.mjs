import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
const {outputText}=ts.transpileModule(readFileSync(new URL('../src/lib/receivables.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {toReceivable,sortReceivables,summarizeReceivables,settlementInput}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const today='2026-10-24';
const entry=(over={})=>({id:'c1:rental:ldj',cycleId:'c1',companyId:'ldj',category:'rental',bulletin:'#015',client:'Transtec',branch:'Pátio 2',company:'LDJ AMBIENTAL',description:'Locação de equipamentos',baseAmount:1000,currentCommission:100,...over});
const tracking=(over={})=>({id:'t1',cycle_id:'c1',category:'rental',outsourced_company_id:'ldj',source_key:'ldj',rule_type:'fixed',rule_value:120,base_amount_snapshot:1000,net_invoice_amount:null,commission_amount:120,invoice_number:'55',invoice_issued_on:'2026-09-20',invoice_due_on:'2026-10-05',expected_basis:'issue',expected_on:'2026-10-10',received_on:null,notes:'ok',updated_at:'2026-09-21',...over});

test('usa o valor conferido no Faturamento e marca vencido quando a previsão passou sem baixa',()=>{
  const r=toReceivable(entry({tracking:tracking()}),today,false);
  assert.equal(r.amount,120);
  assert.equal(r.confirmed,true);
  assert.equal(r.expectedOn,'2026-10-10');
  assert.equal(r.status,'overdue');
  assert.equal(r.canSettle,true);
});

test('sem conferência usa o valor do BM como provisório; acordo obrigatório bloqueia a baixa',()=>{
  const provisional=toReceivable(entry(),today,false);
  assert.equal(provisional.amount,100);
  assert.equal(provisional.confirmed,false);
  assert.equal(provisional.status,'no_date');
  assert.equal(provisional.canSettle,true);
  const needsAgreement=toReceivable(entry(),today,true);
  assert.equal(needsAgreement.canSettle,false);
  const pending=toReceivable(entry({pendingService:true}),today,false);
  assert.equal(pending.canSettle,false);
});

test('situações: recebido, vence em até 7 dias e a vencer',()=>{
  assert.equal(toReceivable(entry({tracking:tracking({received_on:'2026-10-20'})}),today,false).status,'received');
  assert.equal(toReceivable(entry({tracking:tracking({expected_on:'2026-10-30'})}),today,false).status,'due_soon');
  assert.equal(toReceivable(entry({tracking:tracking({expected_on:'2026-12-10'})}),today,false).status,'upcoming');
  assert.equal(toReceivable(entry({legacyExpectedOn:'2026-10-01'}),today,false).status,'overdue');
});

test('ordena vencidos no topo, depois próximos, sem previsão e por fim recebidos recentes',()=>{
  const list=[
    toReceivable(entry({id:'recebido',tracking:tracking({received_on:'2026-10-20'})}),today,false),
    toReceivable(entry({id:'sem-data'}),today,false),
    toReceivable(entry({id:'futuro',tracking:tracking({expected_on:'2026-12-10'})}),today,false),
    toReceivable(entry({id:'vencido',tracking:tracking({expected_on:'2026-09-01'})}),today,false),
    toReceivable(entry({id:'logo',tracking:tracking({expected_on:'2026-10-28'})}),today,false),
  ];
  assert.deepEqual(sortReceivables(list).map(item=>item.id),['vencido','logo','futuro','sem-data','recebido']);
});

test('resumo soma em aberto, vencido, próximos 7 dias e recebido no mês',()=>{
  const list=[
    toReceivable(entry({id:'a',tracking:tracking({expected_on:'2026-09-01'})}),today,false),
    toReceivable(entry({id:'b',tracking:tracking({expected_on:'2026-10-28',commission_amount:50})}),today,false),
    toReceivable(entry({id:'c'}),today,false),
    toReceivable(entry({id:'d',tracking:tracking({received_on:'2026-10-02',commission_amount:70})}),today,false),
  ];
  const s=summarizeReceivables(list,today);
  assert.equal(s.open,120+50+100);
  assert.equal(s.overdue,120);
  assert.equal(s.nextSevenDays,50);
  assert.equal(s.receivedThisMonth,70);
  assert.equal(s.withoutDate,1);
});

test('a baixa preserva a conferência salva e só altera a data de recebimento',()=>{
  const input=settlementInput(entry({tracking:tracking()}),'2026-10-24',false);
  assert.equal(input.received_on,'2026-10-24');
  assert.equal(input.rule_value,120);
  assert.equal(input.invoice_number,'55');
  assert.equal(input.expected_on,'2026-10-10');
  assert.equal(input.notes,'ok');
  assert.equal(settlementInput(entry({tracking:tracking()}),null,false).received_on,null);
});

test('sem conferência a baixa grava o valor do BM como valor fixo; com acordo pendente não grava',()=>{
  const input=settlementInput(entry({legacyInvoiceNumber:'9',legacyExpectedOn:'2026-10-01'}),'2026-10-24',false);
  assert.equal(input.rule_type,'fixed');
  assert.equal(input.rule_value,100);
  assert.equal(input.invoice_number,'9');
  assert.equal(input.expected_basis,'manual');
  assert.equal(settlementInput(entry(),'2026-10-24',true),null);
});

const {receivableDetails}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const sources={
  movementCommissions:[
    {cycle_id:'c1',outsourced_company_id:'ldj',source_type:'treatment',waste_residue_id:'r1',execution_date:'2026-09-10',base_amount:1400,commission_rate:0.05,gross_commission_amount:200,tax_withheld_amount:20,net_commission_amount:180},
    {cycle_id:'c1',outsourced_company_id:'ldj',source_type:'rental',waste_residue_id:null,execution_date:'2026-09-01',base_amount:1000,commission_rate:10,gross_commission_amount:100,tax_withheld_amount:0,net_commission_amount:100},
  ],
  services:[{cycle_id:'c1',outsourced_company_id:'ldj',waste_service_id:'s1',amount:1506,net_invoice_amount:1000,commission_rate:20,invoice_number:'137',execution_date:'2026-09-15',description:null}],
  placements:[{cycle_id:'c2',quantity:2,monthly_rental_rate:160}],
  movements:[{cycle_id:'c2',confirmed:true,removed_quantity:1,weight_kg:4000,exchange_rate:450,treatment_rate:0.35,waste_residue_id:'r1',occurred_on:'2026-09-05',service_order:'OS9'},
             {cycle_id:'c2',confirmed:true,removed_quantity:0,weight_kg:100,exchange_rate:0,treatment_rate:0.5,waste_residue_id:'sucata',occurred_on:'2026-09-06',service_order:null},
             {cycle_id:'c2',confirmed:false,removed_quantity:3,weight_kg:900,exchange_rate:450,treatment_rate:0.35,waste_residue_id:'r1',occurred_on:'2026-09-07',service_order:null}],
  directServices:[{cycle_id:'c2',amount:300,waste_service_id:'s1'}],
  residues:[{id:'r1',name:'LIXO COMERCIAL',jacoby_pays_client:false},{id:'sucata',name:'SUCATA',jacoby_pays_client:true}],
  catalog:[{id:'s1',name:'GESTÃO AMBIENTAL'}],
};

test('comissão de terceirizada detalha cada movimentação com base, taxa, retenção e líquido',()=>{
  const lines=receivableDetails(entry({id:'c1:treatment:ldj',category:'treatment'}),sources);
  assert.equal(lines.length,1);
  assert.match(lines[0].label,/Tratamento de LIXO COMERCIAL/);
  assert.match(lines[0].formula,/retenção/);
  assert.equal(lines[0].value,180);
});

test('comissão de serviço usa o líquido da NF quando informado',()=>{
  const [line]=receivableDetails(entry({id:'c1:service:ldj',category:'service'}),sources);
  assert.match(line.label,/GESTÃO AMBIENTAL · NF 137/);
  assert.match(line.formula,/líquido da NF/);
  assert.equal(line.value,200);
});

test('faturamento direto detalha locação, troca, tratamento com sucata abatida e serviços',()=>{
  const direct=(category)=>receivableDetails(entry({id:`c2:${category}:jacoby`,cycleId:'c2',companyId:null,category}),sources);
  assert.deepEqual(direct('rental').map(l=>l.value),[320]);
  assert.deepEqual(direct('exchange').map(l=>l.value),[450]);
  const treatment=direct('treatment');
  assert.deepEqual(treatment.map(l=>l.value),[1400,-50]);
  assert.match(treatment[1].label,/abatida/);
  assert.deepEqual(direct('service').map(l=>l.value),[300]);
});

const {inPeriod,referenceDate,monthlyTotals,shiftMonth}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('período: todos aceita sem data; mês e intervalo exigem data dentro do período',()=>{
  assert.equal(inPeriod(null,{kind:'all'}),true);
  assert.equal(inPeriod(null,{kind:'month',month:'2026-10'}),false);
  assert.equal(inPeriod('2026-10-31',{kind:'month',month:'2026-10'}),true);
  assert.equal(inPeriod('2026-11-01',{kind:'month',month:'2026-10'}),false);
  assert.equal(inPeriod('2026-10-15',{kind:'range',from:'2026-10-10',to:'2026-10-20'}),true);
  assert.equal(inPeriod('2026-10-21',{kind:'range',from:'2026-10-10',to:'2026-10-20'}),false);
  assert.equal(inPeriod('2026-12-01',{kind:'range',from:'2026-11-01',to:''}),true);
  assert.equal(shiftMonth('2026-12',1),'2027-01');
  assert.equal(shiftMonth('2026-01',-1),'2025-12');
});

test('data de referência é o recebimento quando houve baixa, senão a previsão; totais por mês separam previsto e recebido',()=>{
  const open=toReceivable(entry({id:'a',tracking:tracking({expected_on:'2026-11-10',commission_amount:200})}),today,false);
  const late=toReceivable(entry({id:'b',tracking:tracking({expected_on:'2026-10-10',commission_amount:50})}),today,false);
  const paid=toReceivable(entry({id:'c',tracking:tracking({expected_on:'2026-09-10',received_on:'2026-10-02',commission_amount:70})}),today,false);
  assert.equal(referenceDate(open),'2026-11-10');
  assert.equal(referenceDate(paid),'2026-10-02');
  const months=monthlyTotals([open,late,paid],['2026-10','2026-11']);
  assert.deepEqual(months,[{month:'2026-10',expected:50,received:70},{month:'2026-11',expected:200,received:0}]);
});
