export interface Snapshot {
  path: string;
  content: string;
  from: number;
  to: number;
}
export function validateSnapshot(
  snapshot: Snapshot,
  path: string,
  content: string,
): void {
  if (snapshot.path !== path)
    throw new Error("笔记已切换，请回到原笔记后重试。");
  if (snapshot.content !== content)
    throw new Error("笔记已变化。为保留你的新内容，请重新生成或复制结果。");
  if (
    !Number.isInteger(snapshot.from) ||
    !Number.isInteger(snapshot.to) ||
    snapshot.from < 0 ||
    snapshot.to < snapshot.from ||
    snapshot.to > content.length
  )
    throw new Error("选区位置无效，请重新选择。");
}
/**
 * Locate the originally captured range in the current note. Edits elsewhere in the note
 * (typing, front matter updates) do not block replacing the result; only a missing or
 * ambiguous original does.
 */
export function makeEdit(
  snapshot: Snapshot,
  path: string,
  content: string,
  text: string,
) {
  if (snapshot.path !== path)
    throw new Error("笔记已切换，请回到原笔记后重试。");
  if (snapshot.content === content) {
    validateSnapshot(snapshot, path, content);
    return { from: snapshot.from, to: snapshot.to, text };
  }
  const original = snapshot.content.slice(snapshot.from, snapshot.to);
  const whole = snapshot.from === 0 && snapshot.to === snapshot.content.length;
  if (whole || !original)
    throw new Error("笔记已变化。为保留你的新内容，请重新生成或复制结果。");
  if (content.slice(snapshot.from, snapshot.to) === original)
    return { from: snapshot.from, to: snapshot.to, text };
  const first = content.indexOf(original);
  if (first < 0)
    throw new Error("原来选中的文字已被修改，请重新选择后再生成。");
  if (content.indexOf(original, first + 1) >= 0)
    throw new Error("原来选中的文字在笔记中出现多次，无法确定位置，请复制结果手动替换。");
  return { from: first, to: first + original.length, text };
}
export function canUndo(
  last: { path: string; after: string } | undefined,
  path: string,
  content: string,
): boolean {
  return !!last && last.path === path && last.after === content;
}
