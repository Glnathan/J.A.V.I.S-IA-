// Safe French math evaluator ("combien font 12 fois 7", "15 % de 240", "racine carrée de 144").

const WORD_NUMS: Record<string, string> = {
  zero: "0", un: "1", une: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", six: "6", sept: "7",
  huit: "8", neuf: "9", dix: "10", onze: "11", douze: "12", treize: "13", quatorze: "14", quinze: "15",
  seize: "16", vingt: "20", trente: "30", quarante: "40", cinquante: "50", soixante: "60", cent: "100",
  mille: "1000",
};

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "lp" } | { t: "rp" } | { t: "fn" };

function tokenize(expr: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " ") {
      i++;
      continue;
    }
    if (/[\d.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[\d.]/.test(expr[j])) j++;
      const v = parseFloat(expr.slice(i, j));
      if (Number.isNaN(v)) return null;
      toks.push({ t: "num", v });
      i = j;
      continue;
    }
    if (expr.startsWith("sqrt", i)) {
      toks.push({ t: "fn" });
      i += 4;
      continue;
    }
    if ("+-*/^".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ t: "rp" });
      i++;
      continue;
    }
    return null;
  }
  return toks;
}

function parse(toks: Tok[]): number | null {
  let pos = 0;
  const isOp = (tk: Tok | undefined, ...ops: string[]) => tk !== undefined && tk.t === "op" && ops.includes(tk.v);

  function expr(): number {
    let v = term();
    while (isOp(toks[pos], "+", "-")) {
      const tk = toks[pos++] as { t: "op"; v: string };
      const r = term();
      v = tk.v === "+" ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = power();
    while (isOp(toks[pos], "*", "/")) {
      const tk = toks[pos++] as { t: "op"; v: string };
      const r = power();
      v = tk.v === "*" ? v * r : v / r;
    }
    return v;
  }
  function power(): number {
    const b = unary();
    if (isOp(toks[pos], "^")) {
      pos++;
      return Math.pow(b, power());
    }
    return b;
  }
  function unary(): number {
    if (isOp(toks[pos], "-")) {
      pos++;
      return -unary();
    }
    if (isOp(toks[pos], "+")) {
      pos++;
      return unary();
    }
    return primary();
  }
  function primary(): number {
    const tk = toks[pos++];
    if (!tk) throw new Error("fin inattendue");
    if (tk.t === "num") return tk.v;
    if (tk.t === "fn") return Math.sqrt(unary());
    if (tk.t === "lp") {
      const v = expr();
      if (toks[pos]?.t !== "rp") throw new Error("parenthèse");
      pos++;
      return v;
    }
    throw new Error("jeton inattendu");
  }

  try {
    const v = expr();
    if (pos !== toks.length) return null;
    return Number.isNaN(v) ? null : v;
  } catch {
    return null;
  }
}

/** Returns the numeric result (may be Infinity on division by zero) or null when not a calculation. */
export function evaluateMath(folded: string): number | null {
  let s = ` ${folded} `;
  s = s.replace(
    /\b(combien (font|fait|ca fait|egale?|donne)|ca fait combien|calcule(r)?( moi)?|quel est le resultat de|le resultat de|resultat de|dis moi|donne moi|egal|egale|vaut)\b/g,
    " ",
  );
  s = s.replace(/\b(zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|mille)\b/g, (w) => WORD_NUMS[w] ?? w);
  s = s.replace(/(\d),(\d)/g, "$1.$2");
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:%|pour\s*cent)\s*(?:de|d)\s*(\d+(?:\.\d+)?)/g, "($1/100*$2)");
  s = s.replace(/\bracine\s+carree\s+(?:de\s+|d\s+)?/g, " sqrt ").replace(/\bracine\s+(?:de\s+|d\s+)?/g, " sqrt ");
  s = s.replace(/\bau\s+carre\b/g, "^2").replace(/\bau\s+cube\b/g, "^3");
  s = s.replace(/\b(puissance|exposant)\b/g, "^");
  s = s.replace(/\b(multiplie|multiplies)\s+par\b/g, "*").replace(/\bfois\b/g, "*").replace(/(\d)\s*[x×]\s*(?=\d)/g, "$1*");
  s = s.replace(/\b(divise|divises)\s+par\b/g, "/").replace(/\bsur\b/g, "/").replace(/÷/g, "/");
  s = s.replace(/\bplus\b/g, "+").replace(/\bmoins\b/g, "-");
  s = s.replace(/\b(de|d|le|la|les|l|et|a)\b/g, " ");
  const expr = s.replace(/\s+/g, " ").trim();
  if (!expr || !/^[\d\s+\-*/^().sqrt]+$/.test(expr)) return null;
  if (!/[+\-*/^]|sqrt/.test(expr)) return null;
  const toks = tokenize(expr);
  if (!toks || !toks.length) return null;
  return parse(toks);
}
