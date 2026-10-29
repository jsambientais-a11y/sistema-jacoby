import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(
  readFileSync(new URL("../src/lib/iso-sync-queue.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { IsoSyncQueue } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("envios são serializados, mudanças intermediárias consolidadas e cada revisão é respeitada", async () => {
  const calls = [],
    saved = [];
  let release;
  const queue = new IsoSyncQueue(
    7,
    async (rev, value) => {
      calls.push([rev, value]);
      if (value === "A")
        await new Promise((r) => {
          release = r;
        });
      return rev + 1;
    },
    (v, r) => saved.push([v, r]),
    () => assert.fail("erro inesperado"),
  );
  queue.enqueue("A");
  queue.enqueue("B");
  queue.enqueue("C");
  assert.equal(queue.busy, true);
  assert.deepEqual(calls, [[7, "A"]]);
  release();
  await tick();
  assert.deepEqual(calls, [
    [7, "A"],
    [8, "C"],
  ]);
  assert.deepEqual(saved, [
    ["A", 8],
    ["C", 9],
  ]);
  assert.equal(queue.busy, false);
});
test("conflito interrompe fila sem repetir gravação ou confirmar salvamento", async () => {
  const failed = [],
    saved = [];
  let calls = 0;
  const queue = new IsoSyncQueue(
    2,
    async () => {
      calls++;
      throw new Error("ISO_REVISION_CONFLICT");
    },
    (v) => saved.push(v),
    (e) => failed.push(e.message),
  );
  queue.enqueue("A");
  queue.enqueue("B");
  await tick();
  queue.enqueue("C");
  await tick();
  assert.equal(calls, 1);
  assert.deepEqual(saved, []);
  assert.deepEqual(failed, ["ISO_REVISION_CONFLICT"]);
  assert.equal(queue.busy, false);
});
test("troca de conta ou desmontagem não aplica resposta atrasada", async () => {
  let release;
  const saved = [];
  const queue = new IsoSyncQueue(
    0,
    async () => {
      await new Promise((r) => {
        release = r;
      });
      return 1;
    },
    (v) => saved.push(v),
    () => {},
  );
  queue.enqueue("dados da conta anterior");
  queue.stop();
  release();
  await tick();
  assert.deepEqual(saved, []);
  assert.equal(queue.revision, 0);
});
