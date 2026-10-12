import {
  type Challenge,
  type ComputeProof,
  type Hello,
  helloSchema,
  NONCE_BYTES,
  proofMessage,
  type Ready,
} from "@runyard/protocol";

// 握手的服务端一侧（决策记录 0005；docs/architecture/protocol.md §2）：
// 发质询，校验客户端的证明，再证明自己知道口令。不碰 socket，只吃消息吐消息，所以每条拒绝路径都能单独测。
// 口令只用来做 HMAC 的密钥，从不写进任何消息。

export interface ServerHandshakeConfig {
  /** 口令的 32 个原始字节（发现文件里是它的小写十六进制） */
  token: Uint8Array;
  ipc: {
    computeProof: ComputeProof;
    verifyProof(key: Uint8Array, message: string, proof: string): boolean;
  };
  protocol: number;
  minProtocol: number;
  build: string;
  /** 返回恰好 NONCE_BYTES 个随机字节的小写十六进制；测试里可以换成确定的 */
  newNonce(): string;
}

export type HelloVerdict =
  | { ok: true; hello: Hello; ready: Ready }
  // invalid-hello：不是 hello 消息，或 nonce、证明的格式不对（含长度不是 32 字节）
  // bad-proof：格式对，但证明对不上口令（错误口令、冒充者、把服务端的消息反射回来）
  | { ok: false; reason: "invalid-hello" | "bad-proof" };

export class ServerHandshake {
  readonly challenge: Challenge;
  readonly #config: ServerHandshakeConfig;
  #answered = false;

  constructor(config: ServerHandshakeConfig) {
    const nonce = config.newNonce();
    if (nonce.length !== NONCE_BYTES * 2) throw new Error("server nonce must be 32 bytes");
    this.#config = config;
    this.challenge = {
      t: "challenge",
      nonce,
      protocol: config.protocol,
      minProtocol: config.minProtocol,
    };
  }

  // 每个质询只接受一次应答：重放同一条 hello 不会得到第二个 ready
  receiveHello(value: unknown): HelloVerdict {
    if (this.#answered) return { ok: false, reason: "invalid-hello" };
    this.#answered = true;
    const parsed = helloSchema.safeParse(value);
    if (!parsed.success) return { ok: false, reason: "invalid-hello" };
    const hello = parsed.data;
    const { token, ipc } = this.#config;
    const expected = proofMessage("client", this.challenge.nonce, hello.clientNonce);
    if (!ipc.verifyProof(token, expected, hello.proof)) return { ok: false, reason: "bad-proof" };
    const proof = ipc.computeProof(
      token,
      proofMessage("server", this.challenge.nonce, hello.clientNonce),
    );
    return { ok: true, hello, ready: { t: "ready", proof, build: this.#config.build } };
  }
}
