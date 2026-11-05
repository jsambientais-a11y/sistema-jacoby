import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/client-portal-rules.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  usersManagedInClients,
  portalLoginError,
  generatePortalPassword,
  emptyPortalLogin,
  portalStatusByClient,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("login da RAG e login sem vínculo continuam em Usuários; empresas visíveis vão para Clientes", () => {
  const links = [
    { user_id: "empresa", client_id: "cliente-visivel" },
    { user_id: "rag", client_id: "cliente-demo-oculto" },
  ];
  const managed = usersManagedInClients(links, ["cliente-visivel"]);
  assert.equal(managed.has("empresa"), true);
  assert.equal(managed.has("rag"), false);
  assert.equal(managed.has("sem-vinculo"), false);
});

test("antes de carregar os clientes nenhum login some de Usuários", () => {
  assert.equal(usersManagedInClients([{ user_id: "a", client_id: "b" }], []).size, 0);
});

test("empresa tem acesso com ao menos um login ativo, em qualquer ordem dos vínculos", () => {
  const links = [
    { user_id: "a-bloqueado", client_id: "mista" },
    { user_id: "a-ativo", client_id: "mista" },
    { user_id: "b-ativo", client_id: "mista-invertida" },
    { user_id: "b-bloqueado", client_id: "mista-invertida" },
    { user_id: "c-bloqueado", client_id: "bloqueada" },
    { user_id: "d-ativo", client_id: "liberada" },
  ];
  const status = portalStatusByClient(links, ["a-bloqueado", "b-bloqueado", "c-bloqueado"]);
  assert.equal(status.get("mista"), "enabled");
  assert.equal(status.get("mista-invertida"), "enabled");
  assert.equal(status.get("bloqueada"), "disabled");
  assert.equal(status.get("liberada"), "enabled");
  assert.equal(status.has("sem-login"), false);
});

test("valida nome, e-mail e senha somente quando a senha é obrigatória", () => {
  const valid = {
    ...emptyPortalLogin,
    fullName: "Ana",
    email: "ana@empresa.com",
    password: "123456",
  };
  assert.equal(portalLoginError(valid), null);
  assert.match(portalLoginError({ ...valid, fullName: " " }), /nome/);
  assert.match(portalLoginError({ ...valid, email: "ana" }), /e-mail/);
  assert.match(portalLoginError({ ...valid, password: "123" }), /senha/);
  assert.equal(portalLoginError({ ...valid, password: "" }, false), null);
});

test("senha gerada tem o tamanho pedido e evita caracteres ambíguos", () => {
  for (let i = 0; i < 200; i += 1) assert.match(generatePortalPassword(), /^[^0O1lIo]{10}$/);
});
