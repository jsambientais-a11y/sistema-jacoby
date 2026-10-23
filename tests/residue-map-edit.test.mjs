import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/residue-map-edit.ts',import.meta.url),'utf8'), { compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022} });
const { mapEditPayload, mapEditConditions } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const target = () => ({table:'waste_residues',id:'r1',record:{id:'r1',client_id:'cliente1',updated_at:'2026-10-23T10:00:00Z',name:'Fossa',default_treatment_rate:0.11,active:true,branch_id:null},fields:[{key:'name',label:'Nome',kind:'text'},{key:'default_treatment_rate',label:'Tratamento',kind:'number'},{key:'active',label:'Ativo',kind:'boolean'},{key:'branch_id',label:'Filial',kind:'select',nullable:true,options:[{value:'p1',label:'Pátio 1'}]}]});
const draft=()=>({name:'Fossa',default_treatment_rate:'0,11',active:true,branch_id:''});

test('editar gera apenas os campos alterados e preserva identificadores e histórico',()=>{
 const input=target(); const snapshot=structuredClone(input);assert.deepEqual(mapEditPayload(input,{...draft(),name:'Fossa séptica'}),{name:'Fossa séptica'});assert.deepEqual(input,snapshot);
});
test('reativar não zera valores nem recria o cadastro',()=>{
 const input=target();input.record.active=false;assert.deepEqual(mapEditPayload(input,draft()),{active:true});
});
test('campos sem mudança não são enviados',()=>assert.deepEqual(mapEditPayload(target(),draft()),{}));
test('valor zero e automático vazio são distintos',()=>{
 const input={...target(),record:{jacoby_treatment_rate:null},fields:[{key:'jacoby_treatment_rate',label:'Jacoby/kg',kind:'number',nullable:true}]};
 assert.deepEqual(mapEditPayload(input,{jacoby_treatment_rate:'0'}),{jacoby_treatment_rate:0});
 input.record.jacoby_treatment_rate=0.05;assert.deepEqual(mapEditPayload(input,{jacoby_treatment_rate:''}),{jacoby_treatment_rate:null});
});
test('valores inválidos, negativos e percentuais acima de 100 são recusados',()=>{
 for(const value of ['','abc','-1','Infinity']) assert.throws(()=>mapEditPayload(target(),{...draft(),default_treatment_rate:value}));
 const input={...target(),record:{rate:10},fields:[{key:'rate',label:'Percentual',kind:'number',max:100}]};assert.throws(()=>mapEditPayload(input,{rate:'101'}));assert.deepEqual(mapEditPayload(input,{rate:'0'}),{rate:0});
});
test('filial só pode ser alterada para uma das opções permitidas',()=>{
 assert.throws(()=>mapEditPayload(target(),{...draft(),branch_id:'outra-empresa'}));assert.deepEqual(mapEditPayload(target(),{...draft(),branch_id:'p1'}),{branch_id:'p1'});
});
test('a gravação fica condicionada ao ID, à empresa e à versão original dos campos',()=>{
 const guards=Object.fromEntries(mapEditConditions(target()));assert.equal(guards.id,'r1');assert.equal(guards.client_id,'cliente1');assert.equal(guards.updated_at,'2026-10-23T10:00:00Z');assert.equal(guards.branch_id,null);assert.equal(guards.default_treatment_rate,0.11);
});
test('IDs e empresa não são campos editáveis',()=>{
 for(const key of ['id','client_id']) {const input={...target(),fields:[{key,label:key,kind:'text'}]};assert.throws(()=>mapEditPayload(input,{[key]:'substituir'}));}
});
