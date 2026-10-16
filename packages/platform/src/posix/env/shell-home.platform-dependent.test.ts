import { afterEach, describe, expect, it } from "vitest";
import { getPlatform } from "../../get-platform.ts";
import { absPath } from "../../path-types.ts";
import { makeSyntheticHome, type SyntheticHome } from "../../test-support/synthetic-home.ts";
import { makeTempHome } from "../../test-support/temp-home.ts";
import { shellPath, TEST_PATH } from "../../test-support/toolchain-harness.ts";

// 缺陷 #152：命令行的 `--root` 把平台的主目录换成了数据根目录，登录 shell 也跟着以它为 HOME，
// 读不到用户真正的启动文件（nvm、gvm 都在里面），所有工具都成了 missing。
// 数据根目录和“用户的真实主目录”必须分开：登录 shell 只认后者。

const shell = (shellPath("zsh") ?? shellPath("bash")) as string;
const rcName = shell.endsWith("zsh") ? ".zshrc" : ".bashrc";

let account: SyntheticHome;
let dataRoot: ReturnType<typeof makeTempHome>;

afterEach(() => {
  account?.remove();
  dataRoot?.remove();
});

describe("登录 shell 用用户真实的主目录，不用数据根目录", () => {
  it("[TOOLCHAIN-DETECTION-13] 数据根目录是别处时，仍从真实主目录的启动文件读到终端里才有的 PATH", async () => {
    account = makeSyntheticHome();
    dataRoot = makeTempHome();
    account.write(rcName, 'export PATH="$HOME/nvm-like/bin:$PATH"\n');
    if (rcName === ".bashrc") account.write(".bash_profile", '. "$HOME/.bashrc"\n');
    const platform = getPlatform({
      home: dataRoot.home,
      shellHome: account.home,
      profile: undefined,
      loginShell: absPath(shell),
      baseEnv: { PATH: TEST_PATH, LANG: "en_US.UTF-8" },
    });

    const result = await platform.env.load({ refresh: true });

    expect(result.source).toBe("login-shell");
    expect(result.env.PATH).toContain(`${account.home}/nvm-like/bin`);
    await result.refreshing;
  });
});
