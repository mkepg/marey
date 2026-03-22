import { namedColors } from "./constants";

export interface ScopeNode {
  blockType: string | null;
  vars: Record<string, string>;
}

export function analyzeContext(textUntilCursor: string): ScopeNode[] {
  const scopes: ScopeNode[] = [{ blockType: null, vars: {} }];
  let i = 0;
  let lastKeyword: string | null = null;
  let expectingDefName = false;
  let currentDefName   = "";
  let expectingDefVal  = false;
  let expectingGenName = false;

  // All block types that open a new scope when followed by `{`.
  // "sequence" is included so the scanner tracks we're inside a sequence block,
  // enabling context-aware completions (animate/physics only).
  const validBlocks = new Set([
    "scene", "circle", "rectangle", "polygon", "line", "text",
    "group", "generate", "template", "use", "animate", "physics", "sequence",
  ]);

  while (i < textUntilCursor.length) {
    const char = textUntilCursor[i];

    // ── skip line comments ───────────────────────────────────────────
    if (char === "/" && textUntilCursor[i + 1] === "/") {
      while (i < textUntilCursor.length && textUntilCursor[i] !== "\n") i++;
      continue;
    }

    // ── skip string literals ─────────────────────────────────────────
    if (char === '"') {
      i++;
      while (i < textUntilCursor.length) {
        if (textUntilCursor[i] === "\\") i += 2;
        else if (textUntilCursor[i] === '"') { i++; break; }
        else i++;
      }
      if (expectingDefVal && currentDefName) {
        scopes[scopes.length - 1].vars[currentDefName] = "string";
        expectingDefVal  = false;
        currentDefName   = "";
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

      if (word === "def") {
        expectingDefName = true;
      } else if (expectingDefName) {
        currentDefName   = word;
        expectingDefName = false;
        expectingDefVal  = true;
      } else if (word === "generate") {
        expectingGenName = true;
        lastKeyword      = word;
      } else if (expectingGenName && word !== "from" && word !== "to") {
        // The loop variable becomes a number in scope
        scopes[scopes.length - 1].vars[word] = "number";
        expectingGenName = false;
      } else {
        if (validBlocks.has(word)) {
          lastKeyword = word;
        }
        if (expectingDefVal && currentDefName) {
          if (["contain", "cover", "fill", "none"].includes(word)) {
            scopes[scopes.length - 1].vars[currentDefName] = "sceneFit";
          } else if (namedColors.includes(word)) {
            scopes[scopes.length - 1].vars[currentDefName] = "color";
          } else if (["true", "false"].includes(word)) {
            scopes[scopes.length - 1].vars[currentDefName] = "boolean";
          } else if (["linear", "easeIn", "easeOut", "easeInOut"].includes(word)) {
            scopes[scopes.length - 1].vars[currentDefName] = "easing";
          } else if (word === "indefinitely") {
            // "indefinitely" used as a def value is treated as a number sentinel
            scopes[scopes.length - 1].vars[currentDefName] = "number";
          } else {
            // Inherit type from outer scope if variable is referenced
            let inheritedType = "number";
            for (let s = scopes.length - 1; s >= 0; s--) {
              if (scopes[s].vars[word]) {
                inheritedType = scopes[s].vars[word];
                break;
              }
            }
            scopes[scopes.length - 1].vars[currentDefName] = inheritedType;
          }
          expectingDefVal = false;
          currentDefName  = "";
        }
      }
      continue;
    }

    // ── equals sign ──────────────────────────────────────────────────
    if (char === "=") { i++; continue; }

    // ── first character of a def value (non-word) ────────────────────
    if (expectingDefVal && currentDefName) {
      if (char === "#")      scopes[scopes.length - 1].vars[currentDefName] = "color";
      else if (char === "[") scopes[scopes.length - 1].vars[currentDefName] = "pointList";
      else if (char === "(") scopes[scopes.length - 1].vars[currentDefName] = "point";
      else if (/[0-9\-]/.test(char)) scopes[scopes.length - 1].vars[currentDefName] = "number";
      expectingDefVal = false;
      currentDefName  = "";
    }

    i++;
  }

  return scopes;
}