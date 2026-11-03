import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/send-billing-emails/index.ts',import.meta.url),'utf8').replace(/^import \"jsr:.*;\n/m,'').replace(/^import .*createClient.*;\n/m,'const createClient = globalThis.__billingLockClient;\n');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
async function invoke(locked,body){
 let admins=0;
 const oldDeno=globalThis.Deno,oldClient=globalThis.__billingLockClient;
 globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'})[key]}};
 globalThis.__billingLockClient=(_url,key)=>{
  if(key==='server'){admins++;return {};}
  return {auth:{getUser:async()=>({data:{user:{id:'test-user'}}})},rpc:async(name)=>({data:name==='has_app_permission'?true:locked,error:null})};
 };
 try {
  const module=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#${locked}-${JSON.stringify(body)}`);
  const response=await module.default.fetch(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)}));
  return {response,admins};
 }finally{globalThis.Deno=oldDeno;globalThis.__billingLockClient=oldClient;}
}
test('restricted user cannot send a cycle, a delivery or a whole queue through service credentials',async()=>{
 for(const body of [{cycleId:'test-cycle'},{deliveryId:'test-delivery'},{}]){
  const {response,admins}=await invoke(true,body);
  assert.equal(response.status,403);assert.equal(admins,0);
 }
});
test('unrestricted caller retains the existing dispatch flow',async()=>{
 const {response,admins}=await invoke(false,{});
 assert.equal(response.status,503);assert.equal(admins,1);
 assert.equal((await response.json()).configured,false);
});
