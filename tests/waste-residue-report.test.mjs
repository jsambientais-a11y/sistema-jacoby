import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const domain=compile(readFileSync(new URL('../src/lib/waste-residue-report.ts',import.meta.url),'utf8'));
const {buildWasteResidueReport,buildPortalMovementReport}=await import(domain);
const branches=[{id:'a',name:'Filial A'},{id:'b',name:'Filial B'}];
const residues=[{id:'m1',name:'MADEIRA 1'},{id:'m2',name:'Madeira 2'},{id:'l',name:'LIXO COMERCIAL'}];
const move=(id,residue,branch,kg,extra={})=>({id,waste_residue_id:residue,branch_id:branch,weight_kg:kg,occurred_on:'2026-10-01',...extra});
const data=[move('1','m1','a',100.25),move('2','m2','b','200.75'),move('3','l','a',50),move('4',null,null,0),move('5','unknown','a',25),move('6','m1','a',900,{operation_type:'container_placement'}),move('7','l','a',800,{occurred_on:'2025-10-01'}),move('8','l','a',700,{occurred_on:'2026-09-01'})];
const filters={year:'2026',month:'10',branch:'all',residue:'all'};
test('year, month, branch and residue narrow the same rows used by totals and detail',()=>{
 const report=buildWasteResidueReport(data,branches,residues,{...filters,branch:'a',residue:'MADEIRA'});
 assert.deepEqual(report.rows.map(item=>item.id),['1']);assert.equal(report.totalKg,100.25);assert.equal(report.monthly[0].kg,100.25);
 const wood=buildWasteResidueReport(data,branches,residues,{...filters,residue:'MADEIRA'});
 assert.equal(wood.totalKg,301);assert.equal(wood.summary.length,1);assert.equal(wood.rows.length,2);
});
test('missing catalog labels and zero-weight records are retained; container placements are excluded',()=>{
 const report=buildWasteResidueReport(data,branches,residues,filters);
 assert.equal(report.rows.length,5);assert.equal(report.totalKg,376);assert.equal(report.summary.length,4);
 assert.equal(report.summary.reduce((sum,item)=>sum+item.kg,0),report.totalKg);
 assert.equal(report.summary.reduce((sum,item)=>sum+item.count,0),report.rows.length);
 assert.ok(report.summary.some(item=>item.name==='RESÍDUO NÃO IDENTIFICADO'));
 assert.ok(report.summary.some(item=>item.name==='SEM RESÍDUO INFORMADO'&&item.count===1));
 assert.ok(Math.abs(report.summary.reduce((sum,item)=>sum+item.percentage,0)-100)<1e-8);
});
test('annual evolution and no-match filters have no hidden totals',()=>{
 const annual=buildWasteResidueReport(data,branches,residues,{...filters,month:'todos'});
 assert.equal(annual.monthly.length,12);assert.equal(annual.totalKg,1076);assert.equal(annual.monthly[8].kg,700);
 const empty=buildWasteResidueReport(data,branches,residues,{...filters,branch:'b',residue:'LIXO COMERCIAL'});
 assert.equal(empty.rows.length,0);assert.equal(empty.totalKg,0);assert.equal(empty.summary.length,0);
});
test('multi-page PDF handles a long client name and keeps all source movements in the report model',async()=>{
 const pdfSource=readFileSync(new URL('../src/lib/waste-residue-report-pdf.ts',import.meta.url),'utf8')
  .replace('from "jspdf"',`from ${JSON.stringify(import.meta.resolve('jspdf'))}`)
  .replace('from "./waste-residue-report"',`from ${JSON.stringify(domain)}`);
 const {createWasteResidueReportPdf}=await import(compile(pdfSource));
 const many=Array.from({length:137},(_,i)=>move(String(i),'l','a',12.5,{service_order:'OS-'+i}));
 const report=buildWasteResidueReport(many,branches,residues,filters);
 const {doc,fileName}=createWasteResidueReportPdf({clientName:'Empresa Exemplo com Razão Social Extensa para Conferência de Paginação de Relatórios Ambientais',report});
 assert.equal(report.rows.length,137);assert.equal(report.totalKg,1712.5);assert.ok(doc.getNumberOfPages()>3);
 assert.ok(Buffer.from(doc.output('arraybuffer')).subarray(0,4).equals(Buffer.from('%PDF')));
 assert.match(fileName,/2026-10\.pdf$/);
});

test('client movement export uses only the visible rows and retains the displayed filters',()=>{
 const visible=[{id:'visible-1',occurred_on:'2026-03-12',branch_name:'Unidade A',residue_name:'MADEIRA',weight_kg:1250.5,service_order:'OS-1'},
 {id:'visible-2',occurred_on:'2026-03-14',branch_name:'Unidade A',residue_name:'MADEIRA',weight_kg:250,service_order:'OS-2'}];
 const report=buildPortalMovementReport(visible,{year:'2026',month:'03',branch:'Unidade A',residue:'MADEIRA'});
 assert.deepEqual(report.rows.map(item=>item.id).sort(),['visible-1','visible-2']);
 assert.equal(report.totalKg,1500.5);assert.equal(report.rows.length,2);assert.equal(report.summary.length,1);
 assert.equal(report.branchLabel,'Unidade A');assert.equal(report.residueLabel,'MADEIRA');
 assert.equal(report.monthly.length,1);assert.equal(report.monthly[0].kg,1500.5);
 const annual=buildPortalMovementReport(visible,{year:'2026',month:'all',branch:'all',residue:'all'});
 assert.equal(annual.filters.month,'todos');assert.equal(annual.monthly.length,12);
 assert.equal(annual.branchLabel,'Todos os pátios e filiais');
});
