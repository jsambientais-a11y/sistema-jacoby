import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const cycle=url(compile(readFileSync(new URL('../src/lib/cycle-invoices.ts',import.meta.url),'utf8')));
const code=readFileSync(new URL('../src/lib/replace-finalized-invoice.ts',import.meta.url),'utf8').replace('"./cycle-invoices"',JSON.stringify(cycle));
const {replaceFinalizedInvoice}=await import(url(compile(code)));
test('replacement only updates existing path, keeps links, requests no insert/delete',async()=>{
 let calls=[];const b={update:async(...args)=>{calls.push(args);return {error:null}}};
 const file={name:'correta.PDF',size:123,type:'application/pdf'};
 await replaceFinalizedInvoice(b,'cycle-invoices/id/old.pdf','old.pdf',file);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'cycle-invoices/id/old.pdf');assert.equal(calls[0][1],file);assert.equal(calls[0][2].cacheControl,'0');
});
test('empty, oversized, different-format files fail before storage; server denial is preserved',async()=>{
 let count=0;const b={update:async()=>{count++;return {error:{message:'permission denied'}}}};
 for(const f of [{name:'a.pdf',size:0},{name:'a.pdf',size:16*1024*1024},{name:'a.png',size:100}]) await assert.rejects(replaceFinalizedInvoice(b,'path','original.pdf',f));
 assert.equal(count,0);
 await assert.rejects(replaceFinalizedInvoice(b,'path','original.pdf',{name:'a.pdf',size:100}),/permission denied/);
});
