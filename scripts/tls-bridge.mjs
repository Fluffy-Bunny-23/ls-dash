/** Local TLS-termination test stand-in for the user's nginx (self-signed). */
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";

const cert = {
  key: readFileSync("/tmp/lsdash-evidence/tls/key.pem"),
  cert: readFileSync("/tmp/lsdash-evidence/tls/cert.pem"),
};

function bridge(listenPort, targetPort) {
  https
    .createServer(cert, (req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const headers = { ...req.headers, host: `127.0.0.1:${targetPort}` };
        delete headers["content-length"];
        const proxy = http.request(
          {
            host: "127.0.0.1",
            port: targetPort,
            path: req.url,
            method: req.method,
            headers,
          },
          (pres) => {
            res.writeHead(pres.statusCode ?? 502, pres.headers);
            pres.pipe(res);
          },
        );
        proxy.on("error", (e) => {
          res.writeHead(502);
          res.end(String(e));
        });
        proxy.end(body);
      });
    })
    .listen(listenPort, "127.0.0.1", () =>
      console.log(`tls :${listenPort} -> http 127.0.0.1:${targetPort}`),
    );
}

bridge(18443, 8081); // firestore
bridge(18444, 9090); // auth
