// Pilote Chrome headless via CDP : charge la page d'auto-test et attend le résultat réel.
const { spawn } = await import("node:child_process");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--remote-debugging-port=9223",
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws = null;
let msgId = 0;
const pending = new Map();

try {
  // Attendre le port de débogage.
  let targets = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    try {
      const r = await fetch("http://127.0.0.1:9223/json");
      targets = await r.json();
      if (targets.length) break;
    } catch { /* en attente */ }
  }
  const page = targets.find((t) => t.type === "page");
  console.log("cible:", page ? page.url : "aucune");

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++msgId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data.toString());
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  };

  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:3998/voice-selftest.html" });

  // Suivi : la page loggue aussi dans la console (captée par le protocole).
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data.toString());
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "log") {
      console.log("[page]", m.params.args.map((a) => a.value).join(" "));
    }
  };
  await send("Runtime.enable");

  // Attendre le résultat final (jusqu'à 5 minutes : le modèle fait ~100 Mo).
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const r = await send("Runtime.evaluate", { expression: 'document.getElementById("log")?.textContent ?? ""' });
    if (r.result?.value?.includes("RESULTAT FINAL")) {
      console.log("=== JOURNAL COMPLET ===");
      console.log(r.result.value);
      break;
    }
    if (i % 6 === 5) console.log("… en cours :", (r.result?.value ?? "").split("\n").slice(-1)[0]);
  }
} catch (e) {
  console.log("ERREUR PILOTE:", e.message);
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}
