import { createContext } from "react";
import type { ButtonSize } from "../Button/Button.tsx";

// 组里的按钮读这里的档位；组外是 null，按钮用自己的 size
export const ButtonSizeContext = createContext<ButtonSize | null>(null);
