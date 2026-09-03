import {
  BOOLEAN_VALUES,
  DURATION_VALUES,
  EASING_VALUES,
  FIT_VALUES,
  LANGUAGE_CONTRACT,
  NAMED_COLORS,
} from "../../../compiler/languageContract";

const namedColorKeys = Object.keys(NAMED_COLORS);

export interface ScopeNode {
  blockType: string | null;
  vars: Record<string, string>;
}

export function analyzeContext(textUntilCursor: string): ScopeNode[] {
  const scopes: ScopeNode[] = [{ blockType: null, vars: {} }];
  let i = 0;
  let lastKeyword: string | null = null;
  let expectingBindingName = false;
  let currentBindingName   = "";
  let expectingBindingVal  = false;
  let expectingGenName = false;

  // All block types that open a new scope when followed by `{`.
  // "sequence" and "parallel" are included so the scanner tracks we're inside them
  const grammarOnlyBlocks = ["generate", "template", "use"];
  const validBlocks = new Set([...Object.keys(LANGUAGE_CONTRACT), ...grammarOnlyBlocks]);

  while (i < textUntilCursor.length) {
    const char = textUntilCursor[i];

    if (char === "/" && textUntilCursor[i + 1] === "/") {
      while (i < textUntilCursor.length && textUntilCursor[i] !== "\n") i++;
      continue;
    }

    if (char === '"') {
      i++;
      while (i < textUntilCursor.length) {
        if (textUntilCursor[i] === "\\") i += 2;
        else if (textUntilCursor[i] === '"') { i++; break; }
        else i++;
      }
      if (expectingBindingVal && currentBindingName) {
        scopes[scopes.length - 1].vars[currentBindingName] = "string";
        expectingBindingVal  = false;
        currentBindingName   = "";
      }
      continue;
    }

    // ── open scope ───────────────────────────────────────────────────
    if (char === "{") {
      scopes.push({ blockType: lastKeyword, vars: {} });
      lastKeyword = null;
      i++;
      continue;
    }

    // ── close scope ──────────────────────────────────────────────────
    if (char === "}") {
      if (scopes.length > 1) scopes.pop();
      lastKeyword = null;
      i++;
      continue;
    }

    // ── whitespace ───────────────────────────────────────────────────
    if (/\s/.test(char)) { i++; continue; }

    // ── identifiers and keywords ─────────────────────────────────────
    if (/[a-zA-Z_]/.test(char)) {
      const start = i;
      while (i < textUntilCursor.length && /[a-zA-Z0-9_]/.test(textUntilCursor[i])) i++;
      const word = textUntilCursor.slice(start, i);

      if (word === "let") {
        expectingBindingName = true;
      } else if (expectingBindingName) {
        currentBindingName   = word;
        expectingBindingName = false;
        expectingBindingVal  = true;
      } else if (word === "generate") {
        expectingGenName = true;
        lastKeyword      = word;
      } else if (expectingGenName && word !== "from" && word !== "to") {
        scopes[scopes.length - 1].vars[word] = "number";
        expectingGenName = false;
      } else {
        if (validBlocks.has(word)) {
          lastKeyword = word;
        }

        if (expectingBindingVal && currentBindingName) {
          if (FIT_VALUES.includes(word as (typeof FIT_VALUES)[number])) {
            scopes[scopes.length - 1].vars[currentBindingName] = "fit";
          } else if (namedColorKeys.includes(word)) {
            scopes[scopes.length - 1].vars[currentBindingName] = "color";
          } else if (BOOLEAN_VALUES.includes(word as (typeof BOOLEAN_VALUES)[number])) {
            scopes[scopes.length - 1].vars[currentBindingName] = "boolean";
          } else if (EASING_VALUES.includes(word as (typeof EASING_VALUES)[number])) {
            scopes[scopes.length - 1].vars[currentBindingName] = "easing";
          } else if (DURATION_VALUES.includes(word as (typeof DURATION_VALUES)[number])) {
            scopes[scopes.length - 1].vars[currentBindingName] = "indefinitely";
          } else {
            let inheritedType = "number";
            for (let s = scopes.length - 1; s >= 0; s--) {
              if (scopes[s].vars[word]) {
                inheritedType = scopes[s].vars[word];
                break;
              }
            }
            scopes[scopes.length - 1].vars[currentBindingName] = inheritedType;
          }
          expectingBindingVal = false;
          currentBindingName  = "";
        }
      }
      continue;
    }

    // ── equals sign ──────────────────────────────────────────────────
    if (char === "=") { i++; continue; }

    // ── first character of a let value (non-word) ────────────────────
    if (expectingBindingVal && currentBindingName) {
      if (char === "#")      scopes[scopes.length - 1].vars[currentBindingName] = "color";
      else if (char === "[") scopes[scopes.length - 1].vars[currentBindingName] = "list";
      else if (char === "(") scopes[scopes.length - 1].vars[currentBindingName] = "point";
      else if (/[0-9\-]/.test(char)) scopes[scopes.length - 1].vars[currentBindingName] = "number";

      expectingBindingVal = false;
      currentBindingName  = "";
    }
    i++;
  }

  return scopes;
}
