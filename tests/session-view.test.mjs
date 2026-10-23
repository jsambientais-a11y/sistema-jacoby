import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/session-view.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { readSessionView, writeSessionView } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const strings = value => typeof value === 'string';
test('empresa e busca permanecem apos remontar a navegacao', () => {
 const data = new Map(); const storage = {getItem: k => data.get(k), setItem: (k,v) => data.set(k,v)};
 writeSessionView(storage,'map:client','empresa-teste'); writeSessionView(storage,'map:search','teste');
 assert.equal(readSessionView(storage,'map:client','',strings),'empresa-teste');
 assert.equal(readSessionView(storage,'map:search','',strings),'teste');
 assert.equal(readSessionView(storage,'other:client','all',strings),'all');
});
test('navegacao preserva posicao e zoom sem guardar campos de edicao', () => {
 const data = new Map(); const storage = {getItem: k => data.get(k), setItem: (k,v) => data.set(k,v)};
 const state = {x:-540,y:20}; writeSessionView(storage,'map:pan',state);
 assert.deepEqual(readSessionView(storage,'map:pan',{}, v => v && Number.isFinite(v.x) && Number.isFinite(v.y)),state);
});
test('preferencia invalida ou armazenamento indisponivel nao impede a tela', () => {
 assert.equal(readSessionView({getItem:()=>'{invalid'},'client','all',strings),'all');
 assert.equal(readSessionView({getItem:()=> '42'},'client','all',strings),'all');
 assert.equal(readSessionView(null,'client','all',strings),'all');
 assert.doesNotThrow(() => writeSessionView({setItem:()=>{throw new Error('blocked')}},'client','test'));
});
