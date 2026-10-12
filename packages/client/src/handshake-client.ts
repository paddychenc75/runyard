import {
  type Challenge,
  type ClientKind,
  type ComputeProof,
  challengeSchema,
  type Hello,
  NONCE_BYTES,
  proofMessage,
  type Ready,
  readySchema,
} from "@runyard/protocol";

// 握手的客户端一侧（决策记录 0005；docs/architecture/protocol.md §2）。和服务端一样不碰 socket，
// 只吃消息吐消息，每条拒绝路径都能单独测。口令只用来做 HMAC 的密钥，从不写进任何消息。

export interface ClientHandshakeConfig {
  /** 口令的 32 个原始字节：发现文件里十六进制口令解码后的结果，不是十六进制字符串本身 */
  token: Uint8Array;
  ipc: {
    computeProof: ComputeProof;
    verifyProof(key: Uint8Array, message: string, proof: string): boolean;
  };
  protocol: number;
  minProtocol: number;
  client: { kind: ClientKind; build: string; pid: number };
  /** 返回恰好 NONCE_BYTES 个随机字节的小写十六进制；测试里可以换成确定的 */
  newNonce(): string;
}

export type ChallengeVerdict =
  | { ok: true; challenge: Challenge; hello: Hello }
  // 对方的质询不合格式（含 nonce 不是 32 字节、空的）：不发 hello，直接断开
  | { ok: false; reason: "invalid-challenge" };

export type ReadyVerdict =
  | { ok: true; ready: Ready }
  // invalid-ready：不是 ready 消息或证明的格式不对；bad-proof：对方不知道口令（冒充者、反射回来的应答）
  | { ok: false; reason: "invalid-ready" | "bad-proof" };

export class ClientHandshake {
  readonly #config: ClientHandshakeConfig;
  #challenge: Challenge | undefined;
  #clientNonce: string | undefined;
  #answered = false;

  constructor(config: ClientHandshakeConfig) {
    this.#config = config;
  }

  receiveChallenge(value: unknown): ChallengeVerdict {
    if (this.#challenge !== undefined) return { ok: false, reason: "invalid-challenge" };
    const parsed = challengeSchema.safeParse(value);
    if (!parsed.success) return { ok: false, reason: "invalid-challenge" };
    const challenge = parsed.data;
    const clientNonce = this.#config.newNonce();
    if (clientNonce.length !== NONCE_BYTES * 2) throw new Error("client nonce must be 32 bytes");
    const { token, ipc, protocol, minProtocol, client } = this.#config;
    this.#challenge = challenge;
    this.#clientNonce = clientNonce;
    const proof = ipc.computeProof(token, proofMessage("client", challenge.nonce, clientNonce));
    return {
      ok: true,
      challenge,
      hello: { t: "hello", clientNonce, proof, protocol, minProtocol, client },
    };
  }

  // 每次握手只接受一条 ready：没发过 hello 就收到的，或者重复的，一律不认
  receiveReady(value: unknown): ReadyVerdict {
    if (this.#challenge === undefined || this.#clientNonce === undefined || this.#answered) {
      return { ok: false, reason: "invalid-ready" };
    }
    this.#answered = true;
    const parsed = readySchema.safeParse(value);
    if (!parsed.success) return { ok: false, reason: "invalid-ready" };
    const expected = proofMessage("server", this.#challenge.nonce, this.#clientNonce);
    const { token, ipc } = this.#config;
    if (!ipc.verifyProof(token, expected, parsed.data.proof))
      return { ok: false, reason: "bad-proof" };
    return { ok: true, ready: parsed.data };
  }
}
