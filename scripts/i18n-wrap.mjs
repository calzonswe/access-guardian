// Wrap Swedish UI strings in t('…') using the TypeScript compiler API.
// Usage: node scripts/i18n-wrap.mjs [--dry] [files...]
// Without files it processes the default set (pages, components, context,
// hooks, types, selected services). It is idempotent: wrapped strings are skipped.
// Prints a report of Swedish-looking strings it left alone, for manual review.
import ts from 'typescript';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DRY = process.argv.includes('--dry');
const argFiles = process.argv.slice(2).filter(a => !a.startsWith('--'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const defaultFiles = [
  ...['src/pages', 'src/components', 'src/context', 'src/hooks'].flatMap(d => walk(path.join(ROOT, d))),
  ...['src/types/rbac.ts', 'src/types/organization.ts', 'src/services/api.ts', 'src/services/notifications.ts', 'src/services/exportService.ts', 'src/App.tsx']
    .map(f => path.join(ROOT, f)),
].filter(f => /\.(tsx?|ts)$/.test(f) && !f.includes('/components/ui/') && !/\.test\./.test(f));
const files = argFiles.length ? argFiles.map(f => path.resolve(f)) : defaultFiles;

const SWEDISH = /[åäöÅÄÖ]/;
const UI_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'description', 'emptyText']);
const CODE_KEYS = new Set(['value', 'url', 'key', 'id', 'type', 'variant', 'className', 'icon', 'href', 'to', 'path', 'role', 'status', 'name', 'action', 'target_type', 'mimeType', 'accept', 'method', 'side', 'align', 'activeClassName']);
const looksLikeCode = (s) =>
  /^[\w\-:/.#[\]()%!>&=,@*+]+( [\w\-:/.#[\]()%!>&=,@*+]+)*$/.test(s) && !SWEDISH.test(s) && !/^[A-ZÅÄÖ][a-zåäö]+( |$)/.test(s)
  || /^(\/|https?:|#|\.|mailto:)/.test(s)
  || /^[a-z]+([A-Z_][a-z]+)+$/.test(s); // camelCase/snake identifiers

/** Is this text something a person reads? */
function isUiText(s, strong) {
  const trimmed = s.trim();
  if (!/[A-Za-zÅÄÖåäö]/.test(trimmed)) return false;
  if (looksLikeCode(trimmed)) return false;
  if (strong) return true;                      // JSX text / UI attribute
  return SWEDISH.test(trimmed) || /^[A-ZÅÄÖ][a-zåäö]+\b/.test(trimmed) && /\s/.test(trimmed) || /^[A-ZÅÄÖ][a-zåäö]{2,}$/.test(trimmed);
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

let total = 0;
const leftovers = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // A local `t` (e.g. `const t = setTimeout`, `.map(t => …)`) would shadow the import.
  const shadows = /\b(const|let|var)\s+t\b|\(t\)\s*=>|\bt\s*=>|\(t,|, t\)/.test(src);
  const fn = shadows ? 'tr' : 't';
  const edits = [];

  const isInsideT = (node) => {
    let p = node.parent;
    while (p) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === 't' || p.expression.text === 'tr')) return true;
      p = p.parent;
    }
    return false;
  };
  const skipContext = (node) => {
    const p = node.parent;
    if (!p) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportSpecifier(p)) return true;
    if (ts.isPropertyAssignment(p) && p.name === node) return true;                     // { 'key': … }
    if (ts.isPropertyAssignment(p) && p.initializer === node && ts.isIdentifier(p.name) && CODE_KEYS.has(p.name.text)) return true;
    if (ts.isElementAccessExpression(p)) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
    if (ts.isCaseClause(p)) return true;
    if (ts.isLiteralTypeNode(p)) return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['cn', 'clsx', 'require', 'useParams'].includes(p.expression.text)) return true;
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ['getItem', 'setItem', 'removeItem', 'querySelector', 'get', 'set', 'has', 'startsWith', 'endsWith', 'includes', 'split', 'join', 'replace', 'test', 'addEventListener'].includes(p.expression.name.text)) return true;
    if (ts.isJsxAttribute(p)) return true; // handled separately
    let a = p;
    while (a) { if (ts.isTypeNode(a)) return true; a = a.parent; }
    return false;
  };

  const visit = (node) => {
    // JSX text
    if (ts.isJsxText(node)) {
      const raw = node.getFullText();
      const text = raw.trim();
      if (text && isUiText(text, true) && !isInsideT(node)) {
        const lead = raw.slice(0, raw.indexOf(text));
        const trail = raw.slice(raw.indexOf(text) + text.length);
        const collapsed = text.replace(/\s+/g, ' ');
        edits.push({ start: node.getFullStart(), end: node.getEnd(), text: `${lead}{${fn}(${q(collapsed)})}${trail}` });
      }
    }
    // JSX attributes with readable text
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText();
      const s = node.initializer.text;
      if (UI_ATTRS.has(name) && isUiText(s, true)) {
        edits.push({ start: node.initializer.getStart(), end: node.initializer.getEnd(), text: `{${fn}(${q(s)})}` });
      } else if (SWEDISH.test(s) && name !== 'className') {
        leftovers.push(`${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} attr ${name}="${s}"`);
      }
    }
    // String literals in code
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isJsxAttribute(node.parent)) {
      const s = node.text;
      if (isUiText(s, false) && !skipContext(node) && !isInsideT(node)) {
        edits.push({ start: node.getStart(), end: node.getEnd(), text: `${fn}(${q(s)})` });
      } else if (SWEDISH.test(s) && !isInsideT(node) && !skipContext(node)) {
        leftovers.push(`${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} "${s}"`);
      }
    }
    // Template literals with values: `Hej ${name}` -> t('Hej {name}', { name })
    if (ts.isTemplateExpression(node) && !isInsideT(node) && !skipContext(node)) {
      const parts = [node.head.text, ...node.templateSpans.map(sp => sp.literal.text)].join('');
      if (isUiText(parts, false)) {
        const used = new Set();
        let key = node.head.text;
        const params = [];
        node.templateSpans.forEach((sp, i) => {
          const exprText = sp.expression.getText();
          let n = ts.isIdentifier(sp.expression) ? sp.expression.text
            : ts.isPropertyAccessExpression(sp.expression) ? sp.expression.name.text
            : `v${i}`;
          if (n === 'length') n = `count${i || ''}`;
          while (used.has(n)) n = `${n}${i}`;
          used.add(n);
          key += `{${n}}` + sp.literal.text;
          params.push(n === exprText ? n : `${n}: ${exprText}`);
        });
        edits.push({ start: node.getStart(), end: node.getEnd(), text: `${fn}(${q(key)}, { ${params.join(', ')} })` });
        return; // don't descend: inner strings belong to the expressions
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (edits.length === 0) continue;

  edits.sort((a, b) => b.start - a.start);
  // Drop edits nested inside another edit (outer wins).
  const kept = [];
  for (const e of edits) if (!kept.some(k => e.start >= k.start && e.end <= k.end)) kept.push(e);
  let out = src;
  for (const e of kept) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!/from '@\/i18n'/.test(out)) {
    const imp = fn === 't' ? "import { t } from '@/i18n';\n" : "import { t as tr } from '@/i18n';\n";
    const lastImport = [...out.matchAll(/^import [^;]+;$/gm)].pop();
    out = lastImport ? out.slice(0, lastImport.index + lastImport[0].length) + '\n' + imp.trimEnd() + out.slice(lastImport.index + lastImport[0].length) : imp + out;
  }
  total += kept.length;
  console.log(`${String(kept.length).padStart(4)}  ${path.relative(ROOT, file)}${fn === 'tr' ? '  (as tr)' : ''}`);
  if (!DRY) fs.writeFileSync(file, out);
}
console.log(`\n${total} strings wrapped${DRY ? ' (dry run)' : ''}`);
if (leftovers.length) {
  console.log(`\nSwedish text left unwrapped (${leftovers.length}) — review:`);
  leftovers.forEach(l => console.log('  ' + l));
}
