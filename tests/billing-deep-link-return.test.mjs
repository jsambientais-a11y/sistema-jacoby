import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, require, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require, URLSearchParams, ...globals });
  return exports;
}
const pure = (name) => load(`../src/lib/${name}.ts`, () => { throw Error("Unexpected runtime dependency"); });
const navigation = pure("billing-flow-navigation"), residues = pure("residue-names"), receivables = pure("receivables");
function harness(search) {
  let cursor = 0, tree, Component;
  const slots = [], navigations = [];
  const entries = [
    { id: "a-rental", cycleId: "a", category: "rental", bulletin: "#155", company: "Empresa", currentCommission: 10, baseAmount: 100 },
    { id: "b-service", cycleId: "b", category: "service", bulletin: "#227", company: "Empresa", currentCommission: 20, baseAmount: 200 },
  ];
  const props = { entries, bulletins: [{ id: "a", number: 155 }, { id: "b", number: 227 }], loadError: null, onSave: async () => {}, onSaveBatch: async () => {} };
  const jsx = (type, props) => ({ type, props });
  const render = () => { cursor = 0; tree = Component(props); };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; render(); }]; },
    useRef(value) { return { current: value }; }, useEffect() {},
  };
  const componentStubs = new Proxy({}, { get: (_, name) => String(name) });
  const dependencies = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@tanstack/react-router": { useNavigate: () => (target) => { navigations.push(target); return Promise.resolve(); } },
    "@/lib/billing-flow-navigation": navigation, "@/lib/residue-names": residues,
    "@/lib/receivables": receivables,
  };
  Component = load("../src/components/BillingFlowPreview.tsx", (name) => dependencies[name] || componentStubs, {
    window: { location: { search } },
  }).BillingFlowPreview;
  render();
  function all(node) {
    if (arguments.length === 0) node = tree;
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap((item) => all(item))];
  }
  return { navigations, entries, all, overview: () => all().find((node) => node.type === "BillingBulletinOverview"),
    back: () => all().find((node) => node.type === "Button" && node.props.children?.includes("Voltar aos BMs")),
    detail: () => all().find((node) => typeof node.type === "function" && node.type.name === "BillingFlowDraft" && node.props.entry.cycleId === "a"),
  };
}
test("Faturado deep link opens the exact entry but returning restores all BMs and categories", () => {
  const h = harness("?mapCycle=a&mapEntry=a-rental&mapCategory=rental");
  assert.equal(h.overview(), undefined);
  assert.equal(h.detail().props.entry.id, "a-rental");
  h.back().props.onClick();
  assert.deepEqual(Array.from(h.overview().props.bulletins, (item) => item.id), ["a", "b"]);
  assert.equal(h.overview().props.entries.length, 2);
  assert.equal(h.navigations[0].to, "/financeiro");
  assert.equal(h.navigations[0].replace, true);
  assert.equal(h.navigations[0].search.mapCycle, undefined);
  h.overview().props.onOpenBulletin({ id: "b" });
  assert.equal(h.overview(), undefined);
  assert.ok(h.all().some((node) => node.type === "h2" && JSON.stringify(node.props.children).includes("#227")));
});
test("missing deep-link target remains explicit without hiding the rest of the list forever", () => {
  const h = harness("?mapCycle=a&mapEntry=missing&mapCategory=rental");
  assert.ok(h.all().some((node) => node.props?.role === "alert"));
  h.back().props.onClick();
  assert.equal(h.overview().props.bulletins.length, 2);
});
test("normal back navigation keeps the user's list search without rewriting the route", () => {
  const h = harness("");
  const input = h.all().find((node) => node.props?.["aria-label"] === "Buscar BM, cliente ou empresa");
  input.props.onChange({ target: { value: "155" } });
  h.overview().props.onOpenBulletin({ id: "a" }); h.back().props.onClick();
  assert.equal(h.overview().props.search, "155");
  assert.equal(h.navigations.length, 0);
});
