import { readFileSync } from 'node:fs';
import ts from 'typescript';

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// Resolve TS imports structurally so formatting cannot change what a test loads.
export function loadTs(file, mocks = {}) {
  const urls = new Map();
  function compile(url) {
    if (urls.has(url.href)) return urls.get(url.href);
    let js = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const ast = ts.createSourceFile('module.js', js, ts.ScriptTarget.Latest, true);
    const replacements = ast.statements.filter((statement) => ts.isImportDeclaration(statement) || (ts.isExportDeclaration(statement) && statement.moduleSpecifier)).map((statement) => {
      const specifier = statement.moduleSpecifier;
      const path = specifier.text;
      const replacement = Object.hasOwn(mocks, path)
        ? dataUrl(mocks[path])
        : path.startsWith('.')
          ? compile(new URL(`${path}.ts`, url))
          : import.meta.resolve(path);
      return {
        start: specifier.getStart(ast),
        end: specifier.end,
        text: JSON.stringify(replacement)
      };
    });
    for (const item of replacements.reverse())
      js = js.slice(0, item.start) + item.text + js.slice(item.end);
    const result = dataUrl(js);
    urls.set(url.href, result);
    return result;
  }
  return import(compile(new URL(file, import.meta.url)));
}
