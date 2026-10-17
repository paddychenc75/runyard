import { initialize } from "monaco-editor/editor/editor.worker.js";
import { createVueWorkerService } from "./core";
self.onmessage = () => {
  initialize((ctx: any) => {
    // Monaco 0.57 在构造 WebWorkerServer 的过程中就调用这个工厂，此时 getMirrorModels 还不能用（变量尚在暂时性死区）；
    // 构造期间返回空列表，之后才转交给真实的上下文
    let ready = false;
    const svc = createVueWorkerService({ getMirrorModels: () => (ready ? ctx.getMirrorModels() : []) });
    setTimeout(() => { ready = true; }, 0);
    return svc;
  });
};
