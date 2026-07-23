import { request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Studio → agent-harness proxy (HARNESS-SETUP-PLAN.md §1/§4).
 *
 * The kernel harness is a sibling Bun service on :4820; the browser only ever
 * talks to the studio origin, so this middleware pipes the agent HTTP surface
 * through verbatim:
 *
 *   /api/canvases/:id/agent/*   session create/message/accept/reject/events
 *   /api/agent/*                kernel read API + agent catalog
 *
 * Requests stream through untouched (method, headers, body) and responses
 * stream back untouched — SSE must pass through unbuffered, so headers are
 * flushed as soon as the upstream responds and the body is piped with no
 * content-length assumptions. When the harness is not running, callers get a
 * small 502 JSON instead of a hung request.
 */

const AGENT_PATH_PATTERN = /^\/api\/(?:agent(?:\/|\?|$)|canvases\/[^/]+\/agent(?:\/|\?|$))/;

const DEFAULT_TARGET = "http://127.0.0.1:4820";

/** Hop-by-hop headers a proxy must not forward from the upstream response. */
const HOP_BY_HOP_RESPONSE_HEADERS = ["connection", "keep-alive", "transfer-encoding"];

export function createAgentProxyHandler(options: {
  target?: string;
} = {}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  const target = new URL(options.target ?? DEFAULT_TARGET);

  return (req, res, next) => {
    if (!req.url || !AGENT_PATH_PATTERN.test(req.url)) {
      next();
      return;
    }

    const proxyReq = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        // Forward headers verbatim except host, which must name the target.
        headers: { ...req.headers, host: target.host },
      },
      (proxyRes) => {
        const headers = { ...proxyRes.headers };
        for (const name of HOP_BY_HOP_RESPONSE_HEADERS) {
          delete headers[name];
        }
        res.writeHead(proxyRes.statusCode ?? 502, headers);
        // SSE: get the headers on the wire immediately; the body then streams
        // event-by-event through the pipe below with no buffering.
        res.flushHeaders();
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", () => {
      if (res.headersSent) {
        // Mid-stream failure (e.g. the harness died during an SSE stream):
        // the status is already gone, so just drop the connection.
        res.destroy();
        return;
      }
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(`${JSON.stringify({ error: "agent service is not running" })}\n`);
    });

    // If the browser goes away (tab closed, SSE unsubscribed), tear down the
    // upstream request too. Destroying an already-finished request is a no-op.
    res.on("close", () => {
      proxyReq.destroy();
    });

    req.pipe(proxyReq);
  };
}
