import ts from "typescript";

// 用 TypeScript 自带的编译器接口读源码：注释、字符串、JSX 文字是不同的语法节点，
// 不用正则猜。只解析、不做类型检查，所以很快，也不需要 tsconfig。

export function parseSource(path: string, text: string): ts.SourceFile {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true, kind);
}

export function lineOf(file: ts.SourceFile, pos: number): number {
  return file.getLineAndCharacterOfPosition(pos).line + 1;
}

export function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

export { ts };
