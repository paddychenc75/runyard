import type { RequestMethod, RequestResult, RequestSpec } from "@runyard/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import {
  buildCurl,
  DEFAULT_DRAFT,
  draftToSpec,
  type RequestDraft,
  reloadedAgain,
  specToDraft,
} from "../../../shared/request-model.ts";

/** 响应区显示的一次结果：什么时候收到的、是不是自动重发出来的 */
export interface ShownResponse {
  result: RequestResult;
  at: number;
  auto: boolean;
}

export interface RequestPanelState {
  draft: RequestDraft;
  patch: (change: Partial<RequestDraft>) => void;
  setMethod: (method: RequestMethod) => void;
  response: ShownResponse | null;
  sending: boolean;
  autoResend: boolean;
  setAutoResend: (on: boolean) => void;
  send: () => void;
  copyCurl: () => void;
  openInBrowser: () => void;
  /** 刚复制过：按钮上短暂显示“已复制” */
  copied: boolean;
}

const COPIED_MS = 1500;

// 请求面板的状态（规格 desktop/request-panel）：填写的内容、在途的请求（一次只有一个）、
// 上一次的响应，以及打开时恢复上一次请求、服务重载后自动重发。
// 请求都经主进程转给管理进程发，这里只给路径；界面不碰网络。
export function useRequestPanel(bridge: DesktopBridge, tab: TabRow): RequestPanelState {
  const [draft, setDraft] = useState<RequestDraft>(DEFAULT_DRAFT);
  const [response, setResponse] = useState<ShownResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [autoResend, setAutoResend] = useState(true);
  const [copied, setCopied] = useState(false);
  // 上一次发出的请求：自动重发用它，不用此刻填着的（可能改到一半）
  const lastSent = useRef<RequestSpec | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const autoResendRef = useRef(autoResend);
  autoResendRef.current = autoResend;
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(copiedTimer.current);
    };
  }, []);

  // 重新打开这个项目的标签页：恢复上一次的方法、路径、请求头和请求体（规格 DESKTOP-REQUEST-PANEL-08）
  useEffect(() => {
    void bridge.call("request.getLast", tab.id).then((spec) => {
      if (!alive.current || spec === null) return;
      lastSent.current = spec;
      setDraft(specToDraft(spec));
    });
  }, [bridge, tab.id]);

  const dispatch = useCallback(
    async (spec: RequestSpec, auto: boolean) => {
      // 一次只有一个请求在途（规格 DESKTOP-REQUEST-PANEL-05）
      if (inFlight.current) return;
      inFlight.current = true;
      lastSent.current = spec;
      setSending(true);
      // 不留着上一次的响应：失败时界面只写这一次的原因，不拿旧响应冒充
      setResponse(null);
      try {
        const result = await bridge.call("request.send", { id: tab.id, request: spec });
        if (alive.current) setResponse({ result, at: Date.now(), auto });
      } finally {
        inFlight.current = false;
        if (alive.current) setSending(false);
      }
    },
    [bridge, tab.id],
  );

  // 服务因文件变化重启、重新就绪：开关开着、发过请求才自动重发（规格 DESKTOP-REQUEST-PANEL-09、10）
  const previous = useRef(tab.state);
  useEffect(() => {
    const before = previous.current;
    previous.current = tab.state;
    if (reloadedAgain(before, tab.state) && autoResendRef.current && lastSent.current !== null) {
      void dispatch(lastSent.current, true);
    }
  }, [tab.state, dispatch]);

  return {
    draft,
    patch: (change) => setDraft((current) => ({ ...current, ...change })),
    setMethod: (method) => setDraft((current) => ({ ...current, method })),
    response,
    sending,
    autoResend,
    setAutoResend,
    send: () => void dispatch(draftToSpec(draft), false),
    copyCurl: () => {
      if (tab.port === null) return;
      void bridge.call("clipboard.copy", buildCurl(draftToSpec(draft), tab.port));
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    },
    openInBrowser: () =>
      void bridge.call("request.openInBrowser", { id: tab.id, path: draftToSpec(draft).path }),
    copied,
  };
}
