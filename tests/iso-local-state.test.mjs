import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
const load = async (path, replacements = {}) => {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [from, to] of Object.entries(replacements))
    code = code.replaceAll(JSON.stringify(from), JSON.stringify(to));
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return { url, module: await import(url) };
};
const {
  url: stateUrl,
  module: {
    initializeIsoState: init,
    parseIsoState: parse,
    isoBackupText: backup,
    appendIsoLog: log,
    upsertIsoItem: upsert,
  },
} = await load("../src/lib/iso-local-state.ts", {
  zod: pathToFileURL(require.resolve("zod")).href,
});
const base = () => ({
  id: "audit-a",
  name: "Auditoria cliente privado",
  organization: "Cliente Confidencial Ltda",
  scheduledFor: "2026-10-29",
  type: "Interna",
  standards: ["ISO 14001"],
  scope: "Operação",
  objective: "Verificar",
  processes: "Logística",
  statuses: {},
  criteria: "Procedimentos",
  auditorRole: "Auditor líder",
  hours: "8",
  schedule: [],
  auditees: [],
  room: "",
  ppe: "",
  escort: "",
  logistics: "",
  selectedQuestions: ["q-old"],
  notes: { "q-old": "Nota preservada" },
});
test("migra estado anterior sem apagar dados e inicializa novas coleções", () => {
  const old = { audits: [base()], selectedId: "audit-a", questions: [], evidence: [] };
  const state = parse(JSON.stringify(old));
  assert.deepEqual(state.audits[0], old.audits[0]);
  assert.deepEqual(state.customNcs, []);
  assert.deepEqual(state.activity, []);
  assert.deepEqual(state.favorites, []);
});
test("dados malformados ou perigosos não são aceitos como backup", () => {
  assert.throws(() => parse("{invalid"));
  assert.throws(() => parse(JSON.stringify({ ...init(base()), audits: [] })), /inválidos/);
  assert.throws(() => parse('{"__proto__":{"x":true}}'), /inválida/);
  assert.throws(
    () => parse(JSON.stringify({ ...init(base()), questions: [{ id: "broken" }] })),
    /inválidos/,
  );
});
test("backup preserva anexos e histórico, omitindo funções e detalhes da UI", () => {
  const state = init(base());
  state.audits[0].files = [
    {
      id: "file-uuid-1",
      name: "prova.txt",
      size: 5,
      type: "text/plain",
      ownerId: "q-old",
      addedAt: "now",
    },
  ];
  const result = parse(
    backup({ ...state, storageKey: "internal-scope", selected: state.audits[0], onSave: () => {} }),
  );
  assert.deepEqual(result.audits[0].files, state.audits[0].files);
  assert.ok(!backup({ ...state, storageKey: "private-scope" }).includes("private-scope"));
});
test("IDs de auditoria repetidos e vínculos de NC ausente são rejeitados", () => {
  assert.throws(
    () => parse(JSON.stringify({ ...init(base()), audits: [base(), base()] })),
    /repetidos/,
  );
  const a = base();
  a.plans = [
    {
      id: "p",
      ncId: "missing",
      title: "P",
      standard: "SGI",
      clause: "",
      finding: "",
      cause: "",
      action: "",
      responsible: "",
      dueDate: "",
      status: "Aberto",
      closingEvidence: "",
      effectiveness: "",
      closedOn: "",
      createdAt: "now",
    },
  ];
  assert.throws(() => parse(JSON.stringify(init(a))), /NC ausente/);
});
test("arquivar cadastro preserva referência histórica e pode ser revertido", () => {
  const state = init(base());
  state.questions = [
    {
      id: "q-old",
      question: "Pergunta anterior",
      process: "Logística",
      standard: "ISO 14001",
      clause: "8.1",
      objective: "",
      expected: "",
      alert: "",
    },
  ];
  state.archivedIds = ["q-old"];
  const restored = parse(backup(state));
  assert.equal(restored.questions[0].id, restored.audits[0].selectedQuestions[0]);
  restored.archivedIds = [];
  assert.equal(restored.questions.length, 1);
});
test("log consolida digitação sem misturar auditorias ou ações distintas", () => {
  const first = {
    id: "1",
    auditId: "audit-a",
    at: "2026-10-29T10:00:00Z",
    action: "Editar",
    detail: "Relatório",
  };
  let state = log(init(base()), first);
  state = log(state, { ...first, id: "2", at: "2026-10-29T10:00:05Z" });
  assert.equal(state.activity.length, 1);
  state = log(state, { ...first, id: "3", auditId: "audit-b", at: "2026-10-29T10:00:06Z" });
  assert.equal(state.activity.length, 2);
});
test("editar item mantém ID e não duplica o modelo nem modifica entrada", () => {
  const rows = [{ id: "x", name: "Antes" }];
  const result = upsert(rows, { id: "x", name: "Depois" });
  assert.equal(result.length, 1);
  assert.equal(rows[0].name, "Antes");
  assert.equal(result[0].name, "Depois");
});
test("declaração anonimizada omite nome da organização e título da auditoria", async () => {
  const {
    module: { isoExperienceSections },
  } = await load("../src/lib/iso-experience.ts");
  const anonymous = JSON.stringify(isoExperienceSections([base()], true));
  assert.ok(!anonymous.includes("Cliente Confidencial"));
  assert.ok(!anonymous.includes("cliente privado"));
  assert.ok(anonymous.includes("Organização 1"));
  assert.ok(
    JSON.stringify(isoExperienceSections([base()], false)).includes("Cliente Confidencial"),
  );
});
test("backup ZIP restaura anexos com nova identidade e rejeita arquivo ausente ou adulterado", async () => {
  const {
    module: { inspectIsoBackup },
  } = await load("../src/lib/iso-local-files.ts", {
    "./iso-local-state": stateUrl,
    jszip: pathToFileURL(require.resolve("jszip")).href,
  });
  const JSZip = require("jszip");
  const state = init(base());
  state.audits[0].files = [
    {
      id: "file-1",
      name: "prova.txt",
      size: 5,
      type: "text/plain",
      ownerId: "q-old",
      addedAt: "now",
    },
  ];
  const zip = new JSZip();
  zip.file("workspace.json", backup(state));
  zip.file("files/file-1", "teste");
  let bytes = await zip.generateAsync({ type: "uint8array" });
  const restored = await inspectIsoBackup(new File([bytes], "backup.zip"));
  assert.notEqual(restored.state.audits[0].files[0].id, "file-1");
  assert.equal(await [...restored.files.values()][0].text(), "teste");
  zip.remove("files/file-1");
  bytes = await zip.generateAsync({ type: "uint8array" });
  await assert.rejects(() => inspectIsoBackup(new File([bytes], "backup.zip")), /ausente/);
  zip.file("files/file-1", "diferente");
  bytes = await zip.generateAsync({ type: "uint8array" });
  await assert.rejects(() => inspectIsoBackup(new File([bytes], "backup.zip")), /Tamanho inválido/);
});
test("catálogo próprio cobre sete referenciais e todos os processos sem IDs repetidos", () => {
  const topics = JSON.parse(
    readFileSync(new URL("../src/components/iso/iso-topics.json", import.meta.url), "utf8"),
  );
  assert.equal(new Set(topics.map((t) => t.id)).size, topics.length);
  assert.equal(new Set(topics.map((t) => t.standard)).size, 7);
  assert.equal(new Set(topics.map((t) => t.process)).size, 18);
  assert.ok(topics.every((t) => t.clause && t.title && t.focus && t.expected));
});
