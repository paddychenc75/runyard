// 这个文件由 Node 直接运行，不需要构建。只支持类型注解，不支持 enum、namespace。
interface Greeting {
  name: string;
  times: number;
}

function greet({ name, times }: Greeting): string {
  return Array.from({ length: times }, () => `Hello, ${name}!`).join("\n");
}

console.log(greet({ name: "Runyard", times: 1 }));
