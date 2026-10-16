import { useEffect, useMemo, useState } from "react";
import { Button } from "../src/index.ts";
import { applyToDocument } from "./apply-params.ts";
import {
  formatParams,
  parseParams,
  type ThemeChoice,
  type WorkbenchLocale,
  type WorkbenchParams,
} from "./params.ts";
import { fixtures } from "./registry.ts";
import { workbenchData } from "./sample-data.ts";

export function Workbench() {
  const [params, setParams] = useState(() => parseParams(window.location.search));
  const data = useMemo(() => workbenchData(params.locale), [params.locale]);
  const fixture = fixtures.find((f) => f.meta.name === params.component) ?? fixtures[0];

  useEffect(() => {
    applyToDocument(params);
    window.history.replaceState(null, "", `${formatParams(params)}${window.location.hash}`);
  }, [params]);

  const update = (change: Partial<WorkbenchParams>) => setParams((old) => ({ ...old, ...change }));
  const themes: [ThemeChoice, string][] = [
    ["system", data.chrome.themeSystem],
    ["light", data.chrome.themeLight],
    ["dark", data.chrome.themeDark],
  ];
  const languages: [WorkbenchLocale, string][] = [
    ["en", data.chrome.localeEn],
    ["zh-CN", data.chrome.localeZh],
  ];

  return (
    <div className="workbench">
      <header className="bar">
        <h1 className="title">{data.chrome.title}</h1>
        <fieldset className="group" aria-label={data.chrome.theme}>
          {themes.map(([value, text]) => (
            <Button
              key={value}
              size="sm"
              variant={params.theme === value ? "primary" : "neutral"}
              aria-pressed={params.theme === value}
              onClick={() => update({ theme: value })}
            >
              {text}
            </Button>
          ))}
        </fieldset>
        <fieldset className="group" aria-label={data.chrome.locale}>
          {languages.map(([value, text]) => (
            <Button
              key={value}
              size="sm"
              variant={params.locale === value ? "primary" : "neutral"}
              aria-pressed={params.locale === value}
              onClick={() => update({ locale: value })}
            >
              {text}
            </Button>
          ))}
        </fieldset>
      </header>
      <nav className="list" aria-label={data.chrome.components}>
        {fixtures.map(({ meta }) => (
          <a
            key={meta.name}
            href={`?component=${meta.name}`}
            className="item"
            aria-current={meta.name === fixture?.meta.name ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              update({ component: meta.name });
            }}
          >
            <span data-user-content="">{meta.name}</span>
          </a>
        ))}
      </nav>
      <main className="table">
        {fixture?.samples.map((sample) => (
          <section key={sample.name} className="sample" data-sample={sample.name}>
            <h2 className="sample-name" data-user-content="">
              {sample.name}
            </h2>
            <div className="stage" data-backdrop={fixture.meta.backdrop}>
              {sample.render(data.sample)}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
