import { describe } from "vitest";
import type { ContractContext } from "./context.ts";
import { execContract } from "./exec.contract.ts";
import { identityContract } from "./identity.contract.ts";
import { pathsContract } from "./paths.contract.ts";
import { pendingContract } from "./pending.contract.ts";
import { portsContract } from "./ports.contract.ts";
import { procContract } from "./proc.contract.ts";

// 同一组契约测试对一个实现跑一遍。以后加 win32 实现，给它一个 ContractContext 就行
export function runContract(ctx: ContractContext): void {
  describe(`平台契约：${ctx.name}`, () => {
    identityContract(ctx);
    pathsContract(ctx);
    if (ctx.native) {
      execContract(ctx);
      procContract(ctx);
      portsContract(ctx);
    }
    pendingContract(ctx);
  });
}
