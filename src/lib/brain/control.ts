// Prise de contrôle de l'écran (édition Premium, version PC) : clics, frappe et
// touches exécutés par PowerShell natif de Windows — aucune dépendance à installer.
// Chaque action est validée puis confirmée par l'utilisateur avant exécution.
import { spawn } from "node:child_process";
import { isDesktop } from "@/lib/runtime";

export interface ControlAction {
  kind: "click" | "dblclick" | "type" | "key";
  /** Coordonnées écran (pixels réels) pour click/dblclick. */
  x?: number;
  y?: number;
  /** Texte à taper (type) — 200 caractères maximum. */
  text?: string;
  /** Combinaison de touches (key) : « ctrl+t », « entree », « alt+f4 »… */
  combo?: string;
}

/** Touches reconnues (nom français vers syntaxe SendKeys). */
const KEYS: Record<string, string> = {
  entree: "{ENTER}",
  enter: "{ENTER}",
  tab: "{TAB}",
  echap: "{ESC}",
  esc: "{ESC}",
  espace: " ",
  retour: "{BACKSPACE}",
  suppr: "{DEL}",
  sup: "{PGUP}",
  bas: "{PGDN}",
  debut: "{HOME}",
  fin: "{END}",
  fleche_gauche: "{LEFT}",
  fleche_droite: "{RIGHT}",
  fleche_haut: "{UP}",
  fleche_bas: "{DOWN}",
  f1: "{F1}", f2: "{F2}", f3: "{F3}", f4: "{F4}", f5: "{F5}", f6: "{F6}",
  f7: "{F7}", f8: "{F8}", f9: "{F9}", f10: "{F10}", f11: "{F11}", f12: "{F12}",
};

const MODIFIERS = new Set(["ctrl", "alt", "maj", "win"]);

/** Traduit « ctrl+maj+t » en syntaxe SendKeys (« ^+t »). null = combinaison inconnue. */
function toSendKeys(comboRaw: string): string | null {
  const parts = comboRaw
    .toLowerCase()
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > 3) return null;
  let out = "";
  for (const p of parts) {
    if (p === "ctrl") out += "^";
    else if (p === "alt") out += "%";
    else if (p === "maj") out += "+";
    else if (p === "win") return null; // SendKeys ne gère pas la touche Windows
    else {
      if (p.length !== 1 && !(p in KEYS)) return null;
      out += p in KEYS ? KEYS[p] : p.replace(/[*+^%~()[\]{}]/g, (c) => `{${c}}`);
      return out; // au plus une touche non-modificateur
    }
  }
  return null; // uniquement des modificateurs : incomplet
}

function ps(script: string, timeoutMs = 8000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out: out.slice(0, 500), err: err.slice(0, 500) });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, out: "", err: "PowerShell indisponible" });
    });
  });
}

const MOUSE = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
`;

/** Exécute une action validée. Retourne une erreur claire en cas d'échec. */
export async function runControl(a: ControlAction): Promise<{ ok: boolean; error?: string }> {
  if (!isDesktop()) return { ok: false, error: "La prise de contrôle n'est disponible que sur la version PC installée." };
  const px = Math.round(Number(a.x));
  const py = Math.round(Number(a.y));
  if ((a.kind === "click" || a.kind === "dblclick") && (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || py < 0 || px > 30000 || py > 30000))
    return { ok: false, error: "Coordonnées invalides." };
  if (a.kind === "type") {
    const text = (a.text ?? "").slice(0, 200);
    if (!text) return { ok: false, error: "Aucun texte à taper." };
  }
  if (a.kind === "key") {
    if (!toSendKeys(a.combo ?? "")) return { ok: false, error: "Combinaison de touches non reconnue." };
  }

  try {
    if (a.kind === "click" || a.kind === "dblclick") {
      const clicks = a.kind === "dblclick" ? 2 : 1;
      const r = await ps(
        `${MOUSE}
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${px},${py})
Start-Sleep -Milliseconds 120
${Array.from({ length: clicks }, () => `[W.U]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 60; [W.U]::mouse_event(4,0,0,0,0)`).join("; Start-Sleep -Milliseconds 80; ")}`,
      );
      return r.code === 0 ? { ok: true } : { ok: false, error: r.err || r.out || "Échec du clic." };
    }
    if (a.kind === "type") {
      const escaped = (a.text ?? "").slice(0, 200).replace(/[*+^%~()[\]{}]/g, (c) => `{${c}}`);
      const r = await ps(
        `${MOUSE}
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')`,
      );
      return r.code === 0 ? { ok: true } : { ok: false, error: r.err || r.out || "Échec de la frappe." };
    }
    // key
    const keys = toSendKeys(a.combo ?? "");
    const r = await ps(
      `${MOUSE}
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait('${keys}')`,
    );
    return r.code === 0 ? { ok: true } : { ok: false, error: r.err || r.out || "Échec de la touche." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
