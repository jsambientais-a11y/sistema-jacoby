import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
const compile = (source, jsx = false) =>
  ts.transpileModule(source, {
    fileName: jsx ? "test.tsx" : "test.ts",
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
const url = (source, jsx = false) =>
  `data:text/javascript;base64,${Buffer.from(compile(source, jsx)).toString("base64")}`;
const load = (name) =>
  import(url(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8")));
const { validateTaskAttachment, taskAttachmentPath, uploadTaskAttachment, createTaskUploadLock } =
  await load("task-attachments");
const { mayAppendFinalizedInvoice, invoiceAttachmentActionAllowed, mayCreateBulletin } =
  await load("billing-invoice-access");
const { createLocalReviewBucket } = await load("local-review-storage");

test("imagens com acentos e símbolos usam caminho seguro, mantendo nome no registro; limite 10 MB", () => {
  assert.equal(
    taskAttachmentPath("task", "Ajustes – ilustração (1).png", "file", "step"),
    "task/subtasks/step/file--Ajustes___ilustracao__1_.png",
  );
  assert.throws(() => taskAttachmentPath("../task", "a.png", "file"), /inválido/);
  assert.throws(() => validateTaskAttachment({ size: 0 }), /vazio/);
  assert.throws(() => validateTaskAttachment({ size: 10 * 1024 * 1024 + 1 }), /10 MB/);
  validateTaskAttachment({ size: 10 * 1024 * 1024 });
});
function attachmentClient({
  uploadError = null,
  metadataError = null,
  referenced = false,
  lookupError = null,
} = {}) {
  const calls = [];
  const client = {
    storage: {
      from: (bucket) => ({
        upload: async (path, file, options) => {
          calls.push(["upload", bucket, path, options]);
          return { error: uploadError };
        },
        remove: async (paths) => {
          calls.push(["remove", paths]);
          return { error: null };
        },
      }),
    },
    from: (table) => ({
      insert: (payload) => {
        calls.push(["insert", table, payload]);
        return {
          select: () => ({
            single: async () => ({
              data: metadataError ? null : { id: "attachment", ...payload },
              error: metadataError,
            }),
          }),
        };
      },
      select: () => ({
        eq: () => ({
          limit: async () => ({
            data: referenced ? [{ id: "attachment" }] : [],
            error: lookupError,
          }),
        }),
      }),
    }),
  };
  return { client, calls };
}
const png = () => new File(["fake-png-bytes"], "ilustração.png", { type: "image/png" });
test("upload da tarefa e subtarefa conserva arquivo original e evita overwrite", async () => {
  for (const subtaskId of [undefined, "step"]) {
    const { client, calls } = attachmentClient();
    const row = await uploadTaskAttachment({
      client,
      file: png(),
      taskId: "task",
      userId: "tester",
      subtaskId,
      fileId: "file",
    });
    assert.equal(row.file_name, "ilustração.png");
    assert.equal(row.mime_type, "image/png");
    assert.equal(calls[0][3].upsert, false);
    assert.equal(calls[1][1], subtaskId ? "subtask_attachments" : "attachments");
    assert.equal(row.storage_path.includes("ilustracao.png"), true);
  }
});
test("falha de upload não grava metadados; falha confirmada de registro limpa só arquivo sem referência", async () => {
  const denied = attachmentClient({ uploadError: { message: "permission denied" } });
  await assert.rejects(
    uploadTaskAttachment({ ...denied, file: png(), taskId: "task", userId: "tester" }),
    /permission denied/,
  );
  assert.deepEqual(
    denied.calls.map((call) => call[0]),
    ["upload"],
  );
  const failed = attachmentClient({
    metadataError: { message: "registro recusado", code: "42501" },
  });
  await assert.rejects(
    uploadTaskAttachment({ ...failed, file: png(), taskId: "task", userId: "tester" }),
    /Confira a lista/,
  );
  assert.deepEqual(
    failed.calls.map((call) => call[0]),
    ["upload", "insert", "remove"],
  );
});
test("resultado incerto nunca remove anexo possivelmente referenciado", async () => {
  for (const extra of [{ referenced: true }, { lookupError: { message: "unavailable" } }]) {
    const mocked = attachmentClient({ metadataError: { message: "timeout" }, ...extra });
    await assert.rejects(
      uploadTaskAttachment({ ...mocked, file: png(), taskId: "task", userId: "tester" }),
      /Confira a lista/,
    );
    assert.equal(
      mocked.calls.some((call) => call[0] === "remove"),
      false,
    );
  }
});
test("duplo upload não cria duas tarefas ou arquivos e libera trava após erro ou sucesso", async () => {
  const upload = createTaskUploadLock();
  let release,
    writes = 0;
  const first = upload(async () => {
    writes++;
    await new Promise((resolve) => {
      release = resolve;
    });
  });
  await assert.rejects(
    upload(async () => {
      writes++;
    }),
    /Aguarde/,
  );
  assert.equal(writes, 1);
  release();
  await first;
  await assert.rejects(
    upload(async () => {
      throw new Error("falhou");
    }),
    /falhou/,
  );
  await upload(async () => {
    writes++;
  });
  assert.equal(writes, 2);
});
test("permissão de notas é explícita, depende de billing e nunca libera cliente, substituir ou apagar", () => {
  const flag = ["billing_append_finalized_invoice"];
  assert.equal(mayAppendFinalizedInvoice(flag, true, false), true);
  assert.equal(mayAppendFinalizedInvoice([], true, false), false);
  assert.equal(mayAppendFinalizedInvoice(flag, false, false), false);
  assert.equal(mayAppendFinalizedInvoice(flag, true, true), false);
  assert.equal(invoiceAttachmentActionAllowed(true, true, false), true);
  assert.equal(invoiceAttachmentActionAllowed(true, true, true), false);
  assert.equal(invoiceAttachmentActionAllowed(true, false, false), false);
  assert.equal(invoiceAttachmentActionAllowed(false, false, true), true);
});
test("arquivos de revisão persistem bytes somente no store local, separados por bucket", async () => {
  const data = new Map();
  const store = {
    read: async (key) => data.get(key),
    write: async (file) => {
      data.set(file.key, file);
    },
    remove: async (key) => {
      data.delete(key);
    },
    all: async () => [...data.values()],
  };
  const bucket = createLocalReviewBucket("task-attachments", store);
  assert.equal((await bucket.upload("task/image.png", png())).error, null);
  assert.match((await bucket.upload("task/image.png", png())).error.message, /Já existe/);
  assert.equal(await (await bucket.download("task/image.png")).data.text(), "fake-png-bytes");
  assert.equal((await bucket.list("task")).data[0].name, "image.png");
  assert.equal((await createLocalReviewBucket("other", store).list("task")).data.length, 0);
  await bucket.remove(["task/image.png"]);
  assert.equal((await bucket.list("task")).data.length, 0);
  assert.match((await bucket.download("task/image.png")).error.message, /não encontrado/);
});

// Exercise actual model-library event handlers with minimal UI primitives and deterministic hooks.
let modelTestSequence = 0;
async function modelLibrary(edit) {
  const state = [],
    refs = [];
  let index = 0,
    refIndex = 0;
  const model = {
    id: "model",
    name: "Modelo",
    title: "Processo",
    steps: [
      { title: "Etapa A", notes: "Preservar", assigneeId: null, offsetDays: null },
      { title: "Etapa B", notes: null, assigneeId: null, offsetDays: null },
    ],
  };
  const old = globalThis.__modelUI;
  globalThis.__modelUI = {
    useState: (initial) => {
      const slot = index++;
      if (!(slot in state)) state[slot] = initial;
      return [
        state[slot],
        (value) => {
          state[slot] = typeof value === "function" ? value(state[slot]) : value;
        },
      ];
    },
    useRef: (initial) => (refs[refIndex++] ||= { current: initial }),
    templates: {
      data: [model],
      deleted: [],
      canManage: true,
      edit,
      remove: async () => {},
      restore: async () => {},
    },
  };
  let source = readFileSync(
    new URL("../src/components/ProcessTemplatesLibrary.tsx", import.meta.url),
    "utf8",
  );
  source = source.replace(/^import .*;\n/gm, "");
  const prefix = `import React from ${JSON.stringify(import.meta.resolve("react"))};\nconst {useState,useRef}=globalThis.__modelUI;\nconst useProcessTemplates=()=>globalThis.__modelUI.templates,useTasks=()=>({data:[]});\nconst toast={success:()=>{},error:()=>{}};\nconst Button='button',Input='input',Label='label',Dialog='div',DialogContent='div',DialogTitle='h2',DialogDescription='p',SaveProcessTemplate='span',TaskDialog='span',Layers='span',Plus='span',Search='span',Pencil='span',Trash2='span',ArrowUp='span',ArrowDown='span',Undo2='span';\n`;
  const { ProcessTemplatesLibrary } = await import(
    `${url(prefix + source, true)}#${modelTestSequence++}`
  );
  const render = () => {
    index = 0;
    refIndex = 0;
    return ProcessTemplatesLibrary();
  };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== "object") return null;
    if (predicate(tree)) return tree;
    for (const child of React.Children.toArray(tree.props?.children)) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  };
  return {
    model,
    render,
    find,
    cleanup: () => {
      globalThis.__modelUI = old;
    },
  };
}
test("editar modelo já existe: cancelar preserva modelo e não grava; título/ordem são enviados sem alterar instâncias", async () => {
  const saved = [];
  const ui = await modelLibrary(async (draft) => {
    saved.push(draft);
  });
  const original = structuredClone(ui.model);
  try {
    let tree = ui.render();
    ui.find(tree, (node) => node.props?.["aria-label"] === "Editar modelo Modelo").props.onClick();
    tree = ui.render();
    ui.find(tree, (node) => node.props?.id === "model-name").props.onChange({
      target: { value: "Rascunho" },
    });
    tree = ui.render();
    ui.find(
      tree,
      (node) => node.type === "button" && node.props.children === "Cancelar",
    ).props.onClick();
    assert.equal(saved.length, 0);
    assert.deepEqual(ui.model, original);
    tree = ui.render();
    ui.find(tree, (node) => node.props?.["aria-label"] === "Editar modelo Modelo").props.onClick();
    tree = ui.render();
    ui.find(tree, (node) => node.props?.id === "model-title").props.onChange({
      target: { value: "Novo processo" },
    });
    tree = ui.render();
    ui.find(
      tree,
      (node) => node.props?.["aria-label"] === "Mover etapa 2 para cima",
    ).props.onClick();
    tree = ui.render();
    await ui.find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(saved[0].title, "Novo processo");
    assert.equal(saved[0].steps[0].title, "Etapa B");
    assert.equal(saved[0].steps[1].notes, "Preservar");
    assert.deepEqual(ui.model, original);
  } finally {
    ui.cleanup();
  }
});
test("dupla ação no formulário de edição executa só uma gravação e erro permite tentar novamente", async () => {
  let release,
    calls = 0,
    fail = true;
  const ui = await modelLibrary(async () => {
    calls++;
    if (fail) {
      await new Promise((resolve) => {
        release = resolve;
      });
      throw new Error("recusado");
    }
  });
  try {
    let tree = ui.render();
    ui.find(tree, (node) => node.props?.["aria-label"] === "Editar modelo Modelo").props.onClick();
    tree = ui.render();
    const submit = ui.find(tree, (node) => node.type === "form").props.onSubmit;
    const first = submit({ preventDefault() {} });
    await submit({ preventDefault() {} });
    assert.equal(calls, 1);
    release();
    await first;
    fail = false;
    tree = ui.render();
    await ui.find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(calls, 2);
  } finally {
    ui.cleanup();
  }
});
test("fluxos de tarefa mantêm cancelamento do seletor sem upload e aviso aponta para entregas", () => {
  const source = readFileSync(new URL("../src/components/TaskDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(f\) (?:void )?upload(?:Sub)?File\(/);
  assert.match(source, /e.target.value = ""/);
  assert.match(
    source,
    /\.\.\.buildPayload\(\),[\s\S]*?client_portal_visible: false,[\s\S]*?client_document_request: false/,
  );
  assert.match(source, /setClientDocumentRequest\(false\);\s*setClientPortalVisible\(false\)/);
  const bell = readFileSync(
    new URL("../src/components/NotificationBell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(bell, /n.type === "document_request"/);
  assert.match(bell, /to: "\/portal\/entregas", search: \{ request: n.task_id \}/);
  const finance = readFileSync(
    new URL("../src/components/BilledReceivables.tsx", import.meta.url),
    "utf8",
  );
  assert.match(finance, /Pesquisar terceirizada ou Jacoby/);
  assert.match(finance, /setIssuer\(id\)/);
});

test("cadastrar BM é acesso billing, distinto de anexar em finalizado; cliente e flag isolada não cadastram", () => {
  assert.equal(mayCreateBulletin(true, false), true);
  assert.equal(mayCreateBulletin(false, false), false);
  assert.equal(mayCreateBulletin(true, true), false);
  assert.equal(
    mayAppendFinalizedInvoice(["billing", "billing_lock_finalized"], true, false),
    false,
  );
  const source = readFileSync(
    new URL("../src/components/BillingV2Module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(!mayCreate\) throw Error/);
  assert.match(source, /mutationFn: async \(\) =>\s*createCycleLock.current/);
  assert.match(
    source,
    /<Button allowReadOnly type="button" variant="outline" size="sm" onClick=\{startNewBulletin\}/,
  );
});
