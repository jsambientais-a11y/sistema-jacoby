import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
// Exercise the actual context and control wrappers. Substitute only the visual
// UI primitives so these tests can render without a browser/Radix portal.
const reactUrl=import.meta.resolve('react');
const source=readFileSync(new URL('../src/components/BillingReadOnly.tsx',import.meta.url),'utf8')
 .replace('from "react"',`from ${JSON.stringify(reactUrl)}`)
 .replace(/^import .* from "@\/components\/ui\/.*";\n/gm,'');
const primitives=`\nimport { createElement } from ${JSON.stringify(reactUrl)};
const Button=forwardRef((props,ref)=>createElement('button',{...props,ref}));
const Input=forwardRef((props,ref)=>createElement('input',{...props,ref}));
const Checkbox=forwardRef((props,ref)=>createElement('input',{...props,type:'checkbox',ref}));
const Textarea=forwardRef((props,ref)=>createElement('textarea',{...props,ref}));
const Select=(props)=>createElement('select',props);\n`;
const {outputText}=ts.transpileModule(source+primitives,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}});
// Classic JSX needs the React binding; importing it here keeps runtime semantics.
const code=`import React from ${JSON.stringify(reactUrl)};\n`+outputText;
const controls=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const render=(Component,locked,props={})=>renderToStaticMarkup(React.createElement(controls.BillingReadOnlyProvider,{value:locked},React.createElement(Component,props)));
const hasDisabled=html=>/\sdisabled=""/.test(html);
test('finalized-BM scope disables mutation controls but preserves consultation controls',()=>{
 for(const name of ['BillingButton','BillingInput','BillingSelect','BillingCheckbox','BillingTextarea']){
  assert.equal(hasDisabled(render(controls[name],true)),true,name);
  assert.equal(hasDisabled(render(controls[name],true,{allowReadOnly:true})),false,name+' consultation');
  assert.equal(hasDisabled(render(controls[name],true,{allowReadOnly:true,disabled:true})),true,name+' original disabled');
 }
});
test('open BMs and other users keep normal control behavior',()=>{
 for(const name of ['BillingButton','BillingInput','BillingSelect','BillingCheckbox','BillingTextarea']){
  assert.equal(hasDisabled(render(controls[name],false)),false,name);
  assert.equal(hasDisabled(render(controls[name],false,{disabled:true})),true,name);
 }
});
test('consultation override does not leak into HTML attributes',()=>{
 assert.doesNotMatch(render(controls.BillingButton,true,{allowReadOnly:true}),/allowReadOnly/);
});
