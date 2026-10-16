import "@runyard/tokens/tokens.css";
import "../src/styles/reset.css";
import "../src/styles/base.css";
import "./workbench.css";
import { createRoot } from "react-dom/client";
import { applyToDocument } from "./apply-params.ts";
import { parseParams } from "./params.ts";
import { Workbench } from "./Workbench.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html 里没有 #root");
applyToDocument(parseParams(window.location.search));
createRoot(root).render(<Workbench />);
