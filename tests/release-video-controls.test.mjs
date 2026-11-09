import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the component's real event handlers with an isolated media element.
function harness({ webm, opusSupport = "" } = {}) {
  const slots = [], cleanups = [];
  let cursor = 0, tree, media, mounted = true;
  const jsx = (type, props) => ({ type, props });
  const find = (node, type) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    return [node.props?.children].flat(Infinity).map((child) => find(child, type)).find(Boolean);
  };
  let Component;
  const render = () => {
    cursor = 0;
    tree = Component({ video: { src: "updates/tutorial.mp4", poster: "updates/poster.jpg", captions: "updates/tutorial.vtt", title: "Tutorial", webm }, base: "/" });
    if (media) find(tree, "video").props.ref.current = media;
  };
  const react = {
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (next) => { slots[i] = next; if (mounted) render(); }]; },
    useEffect(effect) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(() => effect()); } },
  };
  const dependencies = { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": { Pause: "Pause", Play: "Play", Volume2: "Volume2" } };
  const source = readFileSync(new URL("../src/components/ReleaseTutorialVideo.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, DOMException, require(name) { if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
  Component = exports.ReleaseTutorialVideo;
  media = {
    paused: true, muted: true, volume: 0, ended: false, currentTime: 0, plays: 0, pauses: 0, loads: 0, removed: [],
    play() { this.plays++; this.paused = false; return Promise.resolve(); },
    canPlayType() { return opusSupport; },
    pause() { this.pauses++; this.paused = true; },
    removeAttribute(name) { this.removed.push(name); if (name === "src") this.src = ""; }, load() { this.loads++; },
  };
  render();
  const dispose = cleanups.map((effect) => effect());
  return {
    media, button: () => find(tree, "button"), video: () => find(tree, "video"), tree: () => tree,
    replayEffects() { for (const cleanup of dispose) cleanup?.(); dispose.splice(0, dispose.length, ...cleanups.map((effect) => effect())); },
    close() { mounted = false; for (const cleanup of dispose) cleanup?.(); find(tree, "video").props.ref.current = null; },
  };
}

test("opening release notes loads only metadata and never starts audio", () => {
  const h = harness();
  assert.equal(h.media.plays, 0);
  assert.equal(h.video().props.autoPlay, false);
  assert.equal(h.video().props.preload, "metadata");
  assert.equal(h.button(), undefined);
  h.close();
});
test("native controls are the only playback controls and there is no playback interception", () => {
  const h = harness();
  assert.equal(h.button(), undefined);
  assert.equal(h.video().props.controls, true);
  assert.equal(h.video().props.onPlay, undefined);
  assert.equal(h.video().props.onClick, undefined);
  assert.equal(h.video().props.muted, undefined);
  h.close();
});
test("uses Opus when supported and falls back to MP4 without changing native playback controls", () => {
  const opus = harness({ webm: "updates/tutorial.webm", opusSupport: "probably" });
  assert.equal(opus.media.src, "/updates/tutorial.webm"); assert.equal(opus.media.plays, 0); opus.close();
  const mp4 = harness({ webm: "updates/tutorial.webm" });
  assert.equal(mp4.media.src, "/updates/tutorial.mp4"); assert.equal(mp4.media.plays, 0); mp4.close();
});
test("React effect replay restores the media source after cleanup without starting audio", () => {
  const h = harness();
  assert.equal(h.media.src, "/updates/tutorial.mp4");
  h.replayEffects();
  assert.equal(h.media.src, "/updates/tutorial.mp4");
  assert.equal(h.media.plays, 0);
  assert.equal(h.media.paused, true);
  h.close();
});
test("closing stops media and detaches its source; reopening remains paused", async () => {
  const h = harness();
  await h.media.play();
  h.close();
  assert.equal(h.media.paused, true);
  assert.deepEqual(h.media.removed, ["src"]);
  assert.equal(h.media.loads, 2);
  const reopened = harness(); assert.equal(reopened.media.plays, 0); reopened.close();
});
test("media loading failures are visible without starting another playback", () => {
  const h = harness();
  h.video().props.onError();
  assert.match(JSON.stringify(h.tree()), /O vídeo não carregou/);
  assert.equal(h.media.plays, 0);
  h.close();
});
