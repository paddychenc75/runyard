// Optional: patch createElement('style') to add a CSP nonce (variant v7)
const nonceMeta = document.querySelector('meta[name="k8-nonce"]') as HTMLMetaElement | null;
if (nonceMeta) {
  const orig = document.createElement.bind(document);
  document.createElement = ((tag: string, opts?: ElementCreationOptions) => {
    const el = orig(tag, opts);
    if (tag.toLowerCase() === "style") el.setAttribute("nonce", nonceMeta.content);
    return el;
  }) as typeof document.createElement;
}

