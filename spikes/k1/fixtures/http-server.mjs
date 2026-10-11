// 一个极小的长驻 HTTP 服务：代替“用户的开发服务器”。只绑定 127.0.0.1。
import http from "node:http";

const port = Number(process.argv[2]);
http
  .createServer((_req, res) => res.end(`k1 ${process.pid}`))
  .listen(port, "127.0.0.1", () => console.log(`listening ${port} pid ${process.pid}`));
