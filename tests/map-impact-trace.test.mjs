import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const transpile = p => ts.transpileModule(readFileSync(new URL(p, import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleUrl = s => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const residueUrl = moduleUrl(transpile('../src/lib/residue-map.ts'));
const code = transpile('../src/lib/map-impact-trace.ts').replace('"./residue-map"',JSON.stringify(residueUrl));
const { financialImpactUrl, commissionTraceSources, impactTraceCycles } = await import(moduleUrl(code));
const empty = () => ({cycles:[],movements:[],placements:[],emissions:[],commissions:[],settings:[],templates:[],rates:[],templateRates:[],equipment:[],tracking:[]});
test('atalho financeiro identifica exatamente BM categoria e terceirizada', () => {
 const url = new URL(financialImpactUrl('bm-15','treatment','cortes'), 'http://localhost');
 assert.equal(url.pathname,'/financeiro');assert.equal(url.searchParams.get('mapCycle'),'bm-15');assert.equal(url.searchParams.get('mapCategory'),'treatment');assert.equal(url.searchParams.get('mapEntry'),'bm-15:treatment:cortes');assert.equal(url.searchParams.get('mapFocus'),'commission');
 assert.equal(new URL(financialImpactUrl('bm-15'),'http://localhost').searchParams.has('mapEntry'),false);
});
test('origem usa referencias registradas mesmo que o cadastro esteja desativado', () => {
 const data=empty();data.commissions=[{cycle_id:'b1',commission_setting_id:'s-old',commission_template_id:'t1'},{cycle_id:'b2',commission_setting_id:'s-new'}];data.settings=[{id:'s-old',active:false},{id:'s-new',active:true}];data.templates=[{id:'t1'},{id:'t-unrelated'}];
 const result=commissionTraceSources('b1',data);assert.deepEqual(result.settings.map(s=>s.id),['s-old']);assert.deepEqual(result.templates.map(s=>s.id),['t1']);
});
test('sem referencia registrada nao atribui origem a uma regra por nome', () => {
 const data=empty();data.commissions=[{cycle_id:'b1'}];data.settings=[{id:'active'}];assert.deepEqual(commissionTraceSources('b1',data),{settings:[],templates:[]});
});
test('rastreamento respeita cliente filial e ID do residuo', () => {
 const data=empty();data.cycles=[{id:'b1',client_id:'c1',branch_id:'p1',bulletin_number:1},{id:'b2',client_id:'c1',branch_id:'p2',bulletin_number:2},{id:'b3',client_id:'c2',branch_id:'p1',bulletin_number:3}];data.movements=[{id:'m1',cycle_id:'b1',waste_residue_id:'r1'},{id:'m2',cycle_id:'b2',waste_residue_id:'r2'}];
 assert.deepEqual(impactTraceCycles('c1','p1',undefined,data).map(c=>c.id),['b1']);assert.deepEqual(impactTraceCycles('c1',null,{id:'r1',name:'Lixo'},data).map(c=>c.id),['b1']);assert.deepEqual(impactTraceCycles('c1',null,undefined,data).map(c=>c.id),['b2','b1']);
});
test('rastreamento de equipamento usa colocacoes e movimentacoes sem depender de residuo', () => {
 const data=empty();data.cycles=[{id:'b1',client_id:'c1',branch_id:null,bulletin_number:1},{id:'b2',client_id:'c1',branch_id:'p2',bulletin_number:2}];data.placements=[{id:'p1',cycle_id:'b1',equipment_id:'e1',waste_residue_id:null}];data.movements=[{id:'m1',cycle_id:'b2',equipment_id:'e2',waste_residue_id:null}];assert.deepEqual(impactTraceCycles('c1',null,undefined,data,'e1').map(c=>c.id),['b1']);assert.deepEqual(impactTraceCycles('c1',null,undefined,data,'e-new'),[]);
});
