import { beforeEach, describe, expect, test } from "bun:test";

import { createSessionRoutes } from "../src/service/routes/sessions";
import { LayoutSessionStore, type LayoutSession } from "../src/service/session";
import { makeTestSession } from "./helpers";
import { box, makeDocument } from "./synthetic";

const BASE = "/api/canvases/routes/agent/sessions/render-session";

let app: ReturnType<typeof createSessionRoutes>;
let session: LayoutSession;

function request(path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`));
}

beforeEach(() => {
  const baseline = makeDocument([box("alpha", 0, 0)]);
  session = makeTestSession(baseline, ["alpha"], {
    id: "render-session",
    canvasId: "routes",
    currentBoard: {
      png: Buffer.from("current-board"),
      n: 3,
      summary: "move_to alpha 240,480",
      at: "2026-07-28T12:03:00.000Z",
      forDraft: baseline,
    },
    changeRenders: [
      {
        n: 1,
        summary: "move_to alpha 120,240",
        png: Buffer.from("change-one"),
        at: "2026-07-28T12:01:00.000Z",
      },
      {
        n: 2,
        summary: "move_to alpha 180,360",
        png: Buffer.from("change-two"),
        at: "2026-07-28T12:02:00.000Z",
      },
      {
        n: 3,
        summary: "move_to alpha 240,480",
        png: Buffer.from("current-board"),
        at: "2026-07-28T12:03:00.000Z",
      },
    ],
  });
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([
    [session.id, session],
  ]);
  app = createSessionRoutes(store);
});

describe("layout-session render routes", () => {
  test("GET board.png returns the eager current board without caching", async () => {
    const response = await request(`${BASE}/board.png`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(Buffer.from(await response.arrayBuffer()).toString("hex"))
      .toBe(session.currentBoard!.png.toString("hex"));
  });

  test("GET renders returns change metadata newest first", async () => {
    const response = await request(`${BASE}/renders`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      renders: [
        { n: 3, summary: "move_to alpha 240,480", at: "2026-07-28T12:03:00.000Z" },
        { n: 2, summary: "move_to alpha 180,360", at: "2026-07-28T12:02:00.000Z" },
        { n: 1, summary: "move_to alpha 120,240", at: "2026-07-28T12:01:00.000Z" },
      ],
    });
  });

  test("GET renders/:n.png returns the requested retained change", async () => {
    const response = await request(`${BASE}/renders/2.png`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("change-two"));
  });

  test("render PNG routes return 404 when current or requested pixels are absent", async () => {
    session.currentBoard = undefined;
    const [board, evicted] = await Promise.all([
      request(`${BASE}/board.png`),
      request(`${BASE}/renders/99.png`),
    ]);

    expect(board.status).toBe(404);
    expect(evicted.status).toBe(404);
  });
});
