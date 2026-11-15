import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";
let sequence = 0;
async function fixture(props, readOnly = false) {
  const old = globalThis.__pickerTest;
  const state = [],
    refs = [];
  let index = 0,
    refIndex = 0,
    opens = 0;
  globalThis.__pickerTest = {
    readOnly,
    useRef: (value) => (refs[refIndex++] ||= { current: value }),
    useState: (value) => {
      const slot = index++;
      if (!(slot in state)) state[slot] = value;
      return [
        state[slot],
        (next) => {
          state[slot] = next;
        },
      ];
    },
  };
  let source = readFileSync(
    new URL("../src/components/BillingInvoiceFilePicker.tsx", import.meta.url),
    "utf8",
  ).replace(/^import .*;\n/gm, "");
  source =
    `import React from ${JSON.stringify(import.meta.resolve("react"))};\nconst {useState,useRef}=globalThis.__pickerTest;const useBillingReadOnly=()=>globalThis.__pickerTest.readOnly;const BillingButton='button',Upload='span';\n` +
    source;
  const code = ts.transpileModule(source, {
    fileName: "picker.tsx",
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const { BillingInvoiceFilePicker: Component } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${sequence++}`
  );
  const inputRef = {
    current: {
      click: () => {
        opens++;
      },
    },
  };
  const find = (node, type) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === type) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  };
  const render = () => {
    index = 0;
    refIndex = 0;
    const tree = Component({ ...props, inputRef });
    return { button: find(tree, "button"), input: find(tree, "input") };
  };
  return {
    render,
    opens: () => opens,
    cleanup: () => {
      globalThis.__pickerTest = old;
    },
  };
}
test("botão nativo abre input montado; cancelar não envia e permite repetir seletor", async () => {
  const sent = [];
  const f = await fixture({
    label: "Anexar",
    onFile: (file) => {
      sent.push(file.name);
    },
  });
  try {
    let ui = f.render();
    assert.equal(ui.button.props.type, "button");
    assert.equal(ui.button.props.asChild, undefined);
    ui.button.props.onClick();
    assert.equal(f.opens(), 1);
    const cancelled = { currentTarget: { files: [], value: "previous" } };
    await ui.input.props.onChange(cancelled);
    assert.equal(cancelled.currentTarget.value, "");
    assert.equal(sent.length, 0);
    ui = f.render();
    ui.button.props.onClick();
    assert.equal(f.opens(), 2);
    for (let i = 0; i < 2; i++) {
      const event = {
        currentTarget: { files: [new File(["image"], "mesma-nota.png")], value: "fake-path" },
      };
      await f.render().input.props.onChange(event);
      assert.equal(event.currentTarget.value, "");
    }
    assert.deepEqual(sent, ["mesma-nota.png", "mesma-nota.png"]);
  } finally {
    f.cleanup();
  }
});
test("readonly bloqueia ambos input e botão; exceção de anexação respeita disabled explícito", async () => {
  for (const [readOnly, allowReadOnly, disabled, blocked] of [
    [false, false, false, false],
    [true, false, false, true],
    [true, true, false, false],
    [true, true, true, true],
    [false, false, true, true],
  ]) {
    const f = await fixture(
      {
        label: "Anexar",
        allowReadOnly,
        disabled,
        onFile: () => assert.fail("não deve enviar sem seleção"),
      },
      readOnly,
    );
    try {
      const ui = f.render();
      assert.equal(ui.button.props.disabled, blocked);
      assert.equal(ui.input.props.disabled, blocked);
      ui.button.props.onClick();
      assert.equal(f.opens(), blocked ? 0 : 1);
    } finally {
      f.cleanup();
    }
  }
});
test("gravação pendente bloqueia repetição síncrona e libera após falha", async () => {
  let release,
    writes = 0;
  const f = await fixture({
    label: "Anexar",
    onFile: async () => {
      writes++;
      await new Promise((resolve) => {
        release = resolve;
      });
      throw new Error("upload simulado recusado");
    },
  });
  try {
    const ui = f.render();
    const event = () => ({
      currentTarget: { files: [new File(["image"], "nota.png")], value: "fake-path" },
    });
    const first = ui.input.props.onChange(event());
    await ui.input.props.onChange(event());
    assert.equal(writes, 1);
    assert.equal(f.render().button.props.disabled, true);
    release();
    await first;
    assert.equal(f.render().button.props.disabled, false);
  } finally {
    f.cleanup();
  }
});
test("linha do serviço finalizado usa input de novas notas e não contorna alteração de serviço", () => {
  const source = readFileSync(
    new URL("../src/components/BillingV2Module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /uploadInputRef=\{cycleInvoiceFileInput\}/);
  assert.match(
    source,
    /const input = cycleInvoiceFileInput.current; if \(mayAppendInvoice && input && !input.disabled\) input.click\(\)/,
  );
  assert.match(source, /if \(isLocked\(cycle\) \|\| isClient \|\| !hasPermission\("billing"\)\)/);
  assert.doesNotMatch(
    source,
    /<input disabled=\{Boolean\(isLocked\(cycle\)\)\} className="sr-only" type="file"/,
  );
});

test("anexo geral também exige billing interno, não apenas a exceção de readonly", () => {
  const source = readFileSync(
    new URL("../src/components/CycleInvoiceAttachments.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /const canUpload = !isClient && hasPermission\("billing"\) && invoiceAttachmentActionAllowed/,
  );
  assert.match(
    source,
    /isClient \|\| !hasPermission\("billing"\) \|\| !invoiceAttachmentActionAllowed/,
  );
});
