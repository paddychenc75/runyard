import { expect, it, vi } from "vitest";
import { VueOperations } from "./vue-operations.ts";
import type { VueSession } from "./vue-projects.ts";

it("补全详情只取缓存候选和原位置，页面伪造的详情标识不转发", async () => {
  const request = vi.fn(async (target: string, method: string) => {
    if (target === "vue" && method === "textDocument/completion")
      return { items: [{ label: "title", data: { trusted: true } }] };
    if (method === "completionInfo") return { entries: [{ name: "count", source: "component" }] };
    return {};
  });
  const session = { request } as unknown as VueSession;
  const operations = new VueOperations();
  const base = { project: "p", path: "Use.vue", requestId: "a" };
  const result = (await operations.request(session, "/project/Use.vue", {
    ...base,
    kind: "completion",
    position: { line: 4, character: 8 },
  })) as { candidates: { detailId: string }[] };
  const before = request.mock.calls.length;
  await expect(
    operations.request(session, "/project/Use.vue", {
      ...base,
      kind: "completionDetails",
      detailId: "/outside/file.vue",
    }),
  ).rejects.toThrow();
  expect(request.mock.calls).toHaveLength(before);
  await operations.request(session, "/project/Use.vue", {
    ...base,
    kind: "completionDetails",
    detailId: result.candidates[1]?.detailId ?? "",
  });
  expect(request).toHaveBeenLastCalledWith(
    "ts",
    "completionEntryDetails",
    {
      file: "/project/Use.vue",
      line: 5,
      offset: 9,
      entryNames: [{ name: "count", source: "component", data: undefined }],
    },
    undefined,
  );
});
