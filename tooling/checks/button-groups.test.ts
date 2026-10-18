import { describe, expect, it } from "vitest";
import { buttonGroups, checkButtonGroups } from "./button-groups.ts";
import { makeRepo } from "./test-helpers.ts";

const P = "apps/desktop/src/renderer/app/X.tsx";

describe("button-groups", () => {
  it("两个相邻的 Button 不放进 ButtonGroup 会报错，带行号和改法", () => {
    const errors = checkButtonGroups(
      P,
      `export const X = () => (<div><Button variant="primary">a</Button><Button>b</Button></div>);`,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`${P}:1`);
    expect(errors[0]).toContain("<ButtonGroup");
  });

  it("放进 ButtonGroup 就通过，穿过片段、条件和 && 也算相邻", () => {
    const text = `export const X = () => (
      <ButtonGroup size="lg">
        {a ? <Button>a</Button> : null}
        <>{b && <Button>b</Button>}</>
      </ButtonGroup>
    );`;
    expect(checkButtonGroups(P, text)).toEqual([]);
    const bad = `export const X = () => (<div>{a && <Button>a</Button>}<>{b && <Button>b</Button>}</></div>);`;
    expect(checkButtonGroups(P, bad)).toHaveLength(1);
  });

  it("ButtonGroup 里嵌套的片段由组统一查", () => {
    const text = `export const X = () => (<ButtonGroup>{a ? null : <><Button>a</Button><Button>b</Button></>}<Button>c</Button></ButtonGroup>);`;
    expect(checkButtonGroups(P, text)).toEqual([]);
  });

  it("条件的两个分支各一个 Button 不算并排", () => {
    const text = `export const X = () => (<div>{a ? <Button>a</Button> : <Button>b</Button>}</div>);`;
    expect(checkButtonGroups(P, text)).toEqual([]);
  });

  it("单个 Button、中间隔着别的元素的 Button 不算并排", () => {
    expect(checkButtonGroups(P, `export const X = () => (<div><Button>a</Button></div>);`)).toEqual(
      [],
    );
    expect(
      checkButtonGroups(
        P,
        `export const X = () => (<div><Button>a</Button><p><Button>b</Button></p></div>);`,
      ),
    ).toEqual([]);
  });

  it("ButtonGroup 里的 Button 自己写 size 会报错", () => {
    const errors = checkButtonGroups(
      P,
      `export const X = () => (<ButtonGroup size="md"><Button size="lg">a</Button><Button>b</Button></ButtonGroup>);`,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("不许自己写 size");
  });

  it("弹窗和提示条的 actions 片段放行，里面的 Button 同样不许写 size", () => {
    const ok = `export const X = () => (<Dialog actions={<><Button>a</Button><Button>b</Button></>} />);`;
    expect(checkButtonGroups(P, ok)).toEqual([]);
    const bad = `export const X = () => (<Dialog actions={<><Button size="lg">a</Button><Button>b</Button></>} />);`;
    expect(checkButtonGroups(P, bad)).toHaveLength(1);
  });

  it("样例文件和测试文件不查", () => {
    const text = `export const X = () => (<div><Button>a</Button><Button size="sm">b</Button></div>);`;
    const root = makeRepo({
      "packages/ui/src/primitives/Button/Button.fixture.tsx": text,
      "packages/ui/src/primitives/Button/Button.test.tsx": text,
    });
    expect(buttonGroups.run(root)).toEqual([]);
  });
});
