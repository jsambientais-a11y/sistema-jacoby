import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
const {outputText}=ts.transpileModule(readFileSync(new URL('../src/lib/app-update.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}});
const {parseAppVersion,updateReloadUrl,updateStatus}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('manifesto precisa ser uma versao valida, e nao HTML de fallback',()=>{assert.equal(parseAppVersion('<html>'),null);assert.equal(parseAppVersion({id:'v1',builtAt:'invalid'}),null);assert.deepEqual(parseAppVersion({id:'v1',builtAt:'2026-10-23T12:00:00Z'}),{id:'v1',builtAt:'2026-10-23T12:00:00Z'})});
test('recarga preserva rota parametros e BM sem acumular identificadores',()=>{const url=new URL(updateReloadUrl('https://gestao.example/portal/residuos?aba=faturamento2&_jacobyUpdate=old#cliente=cliente&boletim=bm218','new'));assert.equal(url.pathname,'/portal/residuos');assert.equal(url.searchParams.get('aba'),'faturamento2');assert.equal(url.hash,'#cliente=cliente&boletim=bm218');assert.deepEqual(url.searchParams.getAll('_jacobyUpdate'),['new'])});
test('recarga suporta o prefixo da publicacao no GitHub Pages',()=>{assert.equal(new URL(updateReloadUrl('https://example.github.io/sistema-jacoby/financeiro','version')).pathname,'/sistema-jacoby/financeiro')});

test('aviso fica atual depois da recarga e volta com nova publicacao',()=>{assert.equal(updateStatus(false,true,false,false),'available');assert.equal(updateStatus(false,true,true,false),'current');assert.equal(updateStatus(false,false,false,false),'checking');assert.equal(updateStatus(false,false,false,true),'current');assert.equal(updateStatus(true,false,false,true),'available')});
