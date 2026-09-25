// Test du modele de voix sur de vraies longueur d'audio (3 a 9 s), dans une fenetre reelle.
const { spawn } = await import("node:child_process");
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--no-sandbox", "--remote-debugging-port=9225", "--window-size=1200,800",
  "--user-data-dir=C:/Users/thepa/AppData/Local/Temp/jarvis-cdp-profile2",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let targets = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try { const r = await fetch("http://127.0.0.1:9225/json"); targets = await r.json(); if (targets.length) break; } catch {}
  }
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === "Runtime.consoleAPICalled") console.log("[page]", m.params.args.map((a) => a.value).join(" ").slice(0, 200));
    if (m.method === "Inspector.targetCrashed") console.log("*** RENDERER CRASHED ***");
  };
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  await send("Runtime.enable");
  console.log("chargement de la page JARVIS…");
  await send("Page.navigate", { url: "http://127.0.0.1:3777/" });
  await sleep(8000);
  console.log("empreintes successives sur des audios de 3 s, 5 s, 8 s (comme les vraies prises)…");
  await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      const w = new Worker("/voice-worker.js", { type: "module" });
      const ask = (audio, id) => new Promise((resolve) => {
        const onMsg = (e) => { if (e.data.id === id) { w.removeEventListener("message", onMsg); resolve(e.data); } };
        w.addEventListener("message", onMsg);
        w.postMessage({ id, type: "embed", audio }, [audio.buffer]);
      });
      // "parole" synthetique : modulation diverse, comme une vraie voix
      for (const seconds of [3, 5, 8]) {
        const n = 16000 * seconds;
        const a = new Float32Array(n);
        for (let i = 0; i < n; i++) a[i] = 0.3 * Math.sin(i / 40 + Math.sin(i / 900) * 3) * Math.sin(i / 3000);
        const t0 = performance.now();
        const r = await ask(a, seconds);
        const mem = Math.round(performance.memory.usedJSHeapSize / 1048576);
        console.log("audio " + seconds + " s -> " + (r.ok ? "EMPREINTE OK" : "erreur: " + r.error) + " en " + Math.round(performance.now() - t0) + " ms, memoire: " + mem + " Mo");
        if (!r.ok) return "ECHEC a " + seconds + " s";
      }
      return "SUCCES : les trois empreintes calculees, page vivante, memoire " + Math.round(performance.memory.usedJSHeapSize / 1048576) + " Mo";
    })()`,
  });
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    const r = await send("Runtime.evaluate", { expression: "window.__done ?? ''" });
  }
} catch (e) {
  console.log("ERREUR PILOTE:", e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
