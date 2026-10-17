// “把焦点还给编辑器”（规格 DESKTOP-TERMINAL-05）：终端和编辑器是两个互不认识的功能模块，
// 终端发这个窗口事件，编辑器自己决定怎么把光标放回原来的位置。
const EVENT = "runyard:focus-editor";

export function requestEditorFocus(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** 编辑器订阅；返回取消订阅的函数 */
export function onEditorFocusRequest(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
