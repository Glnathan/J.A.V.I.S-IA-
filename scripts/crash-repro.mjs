// Reproduit la creation du worker de voix de l'application REELLE dans une fenetre Chrome avec GPU.
const { spawn } = await import("node:child_process");
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--no-sandbox", "--remote-debugging-port=9224", "--window-size=1200,800", "--user-data-dir=C:/Users/thepa/AppData/Local/Temp/jarvis-cdp-profile",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let targets = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try { const r = await fetch("http://127.0.0.1:9224/json"); targets = await r.json(); if (targets.length) break; } catch {}
  }
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === "Runtime.consoleAPICalled") console.log("[page]", m.params.args.map((a) => a.value).join(" "));
    if (m.method === "Inspector.targetCrashed") console.log("*** RENDERER CRASHED ***");
  };
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  await send("Runtime.enable");
  console.log("navigation vers l'application JARVIS (fenetre reelle, GPU actif)…");
  await send("Page.navigate", { url: "http://127.0.0.1:3777/" });
  await sleep(8000);
  console.log("page JARVIS chargee. Creation du worker de voix comme l'application…");
  await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      try {
        const w = new Worker("/voice-worker.js", { type: "module" });
        w.onmessage = (e) => { console.log("worker message: " + JSON.stringify(e.data).slice(0, 150)); window.__voiceResult = JSON.stringify(e.data).slice(0, 200); resolve(window.__voiceResult); };
        w.onerror = (e) => { console.log("worker onerror: " + e.message); window.__voiceResult = "onerror: " + e.message; resolve(window.__voiceResult); };
        console.log("worker /voice-worker.js cree, demande d'empreinte (telechargement du modele possible)…");
        w.postMessage({ id: 1, type: "embed", audio: new Float32Array(1600) });
      } catch (err) { console.log("EXCEPTION: " + err.message); window.__voiceResult = "exception: " + err.message; resolve(window.__voiceResult); }
    })`,
  });
  let result = "jamais repondu";
  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    const r = await send("Runtime.evaluate", { expression: "window.__voiceResult ?? ''" });
    if (r.result?.value) { result = r.result.value; break; }
    if (i % 6 === 5) console.log("… attente modele :", (5 * (i + 1)) + " s");
  }
  console.log("RESULTAT WORKER:", result);
  const alive = await send("Runtime.evaluate", { expression: '"page vivante : " + document.title' });
  console.log(alive.result?.value);
} catch (e) {
  console.log("ERREUR PILOTE:", e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
