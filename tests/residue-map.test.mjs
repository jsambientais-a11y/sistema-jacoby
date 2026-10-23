import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/residue-map.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { residueConnections, sameScopeResidues } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const base = { id:'r1', client_id:'client1', branch_id:null, name:'Fossa séptica', active:true, unit:'kg', default_treatment_rate:0.11 };
const empty = () => ({ cycles:[], movements:[], placements:[], equipment:[], settings:[], rates:[], templates:[], templateRates:[], emissions:[], commissions:[], tracking:[] });

test('nomes iguais em clientes e pátios diferentes não são duplicidades da mesma abrangência', () => {
 const rows=[base,{...base,id:'r2',branch_id:'p1'},{...base,id:'r3',client_id:'client2'},{...base,id:'r4',name:' FOSSA  SÉPTICA ',active:false}];
 assert.deepEqual(sameScopeResidues(base,rows).map(r=>r.id),['r1','r4']);
});
test('contagens usam o ID, mantêm desativados e não misturam resíduos de mesmo nome', () => {
 const data=empty();data.movements=[{id:'m1',cycle_id:'b1',waste_residue_id:'r1'},{id:'m2',cycle_id:'b2',waste_residue_id:'r2'}];data.cycles=[{id:'b1'},{id:'b2'}];
 const result=residueConnections({...base,active:false},data);
 assert.deepEqual(result.movements.map(r=>r.id),['m1']);assert.deepEqual(result.cycles.map(r=>r.id),['b1']);
});
test('BM referenciado em mais de uma origem conta uma vez e notas continuam sendo do BM', () => {
 const data=empty();data.movements=[{id:'m1',cycle_id:'b1',waste_residue_id:'r1'}];data.placements=[{id:'p1',cycle_id:'b1',waste_residue_id:'r1'}];data.emissions=[{id:'e1',cycle_id:'b1',waste_residue_id:'r1'}];data.cycles=[{id:'b1'}];data.tracking=[{id:'nf1',cycle_id:'b1'},{id:'nf2',cycle_id:'b2'}];
 const result=residueConnections(base,data);assert.equal(result.cycles.length,1);assert.deepEqual(result.tracking.map(r=>r.id),['nf1']);
});
test('regra específica é vinculada por ID e modelo por nome sem fundir configurações', () => {
 const data=empty();data.settings=[{id:'s1',outsourced_company_id:'terceira'}];data.rates=[{id:'rate1',waste_residue_id:'r1',commission_setting_id:'s1'},{id:'rate2',waste_residue_id:'r2',commission_setting_id:'s1'}];data.templates=[{id:'t1',outsourced_company_id:'terceira'}];data.templateRates=[{id:'tr1',commission_template_id:'t1',residue_name:'FOSSA SÉPTICA'},{id:'tr2',commission_template_id:'t1',residue_name:'MIX SÓLIDOS'}];
 const result=residueConnections(base,data);assert.deepEqual(result.rules.map(r=>r.id),['rate1']);assert.deepEqual(result.templates.map(r=>r.id),['tr1']);assert.equal(result.rules[0].setting.outsourced_company_id,'terceira');
});
test('a inspeção não modifica cadastros, taxas ou vínculos', () => {
 const data=empty(); const snapshot=structuredClone({base,data}); residueConnections(base,data);sameScopeResidues(base,[base]);assert.deepEqual({base,data},snapshot);
});

test('visão geral identifica também os vínculos dos demonstrativos antigos', () => {
 const data=empty();data.legacyMovements=[{id:'lm1',report_id:'old1',waste_residue_id:'r1'},{id:'lm2',report_id:'old2',waste_residue_id:'r2'}];data.legacyRates=[{id:'lr1',report_id:'old1',waste_residue_id:'r1'}];data.tickets=[{id:'ticket',report_id:'old1',waste_residue_id:'r1'}];data.legacyReports=[{id:'old1'},{id:'old2'}];
 const result=residueConnections(base,data);assert.equal(result.legacyMovements.length,1);assert.equal(result.legacyRates.length,1);assert.equal(result.tickets.length,1);assert.deepEqual(result.legacyReports.map(r=>r.id),['old1']);
});
test('equipamentos usados em movimentações e colocações são conexões mesmo sem resíduo padrão', () => {
 const data=empty();data.movements=[{id:'m',cycle_id:'b',waste_residue_id:'r1',equipment_id:'equip1',replacement_equipment_id:'equip2'}];data.placements=[{id:'p',cycle_id:'b',waste_residue_id:'r1',equipment_id:'equip3'}];data.equipment=[{id:'equip1'},{id:'equip2'},{id:'equip3'},{id:'equip4',default_waste_residue_id:'r1'},{id:'equip5'}];assert.deepEqual(residueConnections(base,data).equipment.map(r=>r.id),['equip1','equip2','equip3','equip4']);
});
