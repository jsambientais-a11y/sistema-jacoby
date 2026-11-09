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

test('notas com seções validam imagem e itens; seção inválida é descartada sem perder as notas',()=>{
  const base={title:'T',summary:'S',changes:['a'],image:'updates/capa.svg',imageAlt:'capa'};
  const ok=parseAppVersion({id:'v2',builtAt:'2026-10-24T12:00:00Z',releaseNotes:{...base,sections:[{title:'Financeiro',description:'d',image:'updates/financeiro.svg',imageAlt:'f',items:['baixa']}]}});
  assert.equal(ok.releaseNotes.sections.length,1);
  const bad=parseAppVersion({id:'v2',builtAt:'2026-10-24T12:00:00Z',releaseNotes:{...base,sections:[{title:'X',description:'d',image:'https://evil/x.svg',imageAlt:'x',items:['i']}]}});
  assert.equal(bad.releaseNotes.title,'T');
  assert.equal(bad.releaseNotes.sections,undefined);
});
test('tutorial local é opcional e caminhos de mídia externos ou inválidos são descartados',()=>{
 const base={title:'T',summary:'S',changes:['a'],image:'updates/capa.jpg',imageAlt:'capa'};
 const video={src:'updates/tutorial.mp4',poster:'updates/tutorial.jpg',captions:'updates/tutorial.vtt',title:'Tutorial narrado'};
 const parse=(v)=>parseAppVersion({id:'v3',builtAt:'2026-11-08T12:00:00Z',releaseNotes:{...base,video:v}});
 assert.deepEqual(parse(video).releaseNotes.video,video);
 assert.equal(parse({...video,webm:'updates/tutorial.webm'}).releaseNotes.video.webm,'updates/tutorial.webm');
 assert.equal(parse({...video,webm:'https://external.example/tutorial.webm'}).releaseNotes.video,undefined);
 for(const bad of [{...video,src:'https://external.example/tutorial.mp4'},{...video,src:'updates/../tutorial.mp4'},{...video,captions:'javascript:alert(1)'},{...video,poster:'data:image/png;base64,abc'},null]){
  const result=parse(bad);assert.equal(result.releaseNotes.video,undefined);assert.equal(result.releaseNotes.title,'T');
 }
 assert.equal(parse(undefined).releaseNotes.video,undefined);
});
