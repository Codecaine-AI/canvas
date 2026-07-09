import { describe, expect, it } from "bun:test";
import { PriorityQueue } from "../pathfinding/priority-queue";
import { Graph } from "../pathfinding/graph";
import { AStarRunner } from "../pathfinding/a-star";
import { Bound } from "../pathfinding/gfx-types";
import { PathGenerator } from "../pathfinding/path-generator";

describe("vendored blocksuite priority-queue", () => {
  it("dequeues in ascending priority order", () => {
    const queue = new PriorityQueue<string, number>((a, b) => a - b);
    queue.enqueue("c", 3);
    queue.enqueue("a", 1);
    queue.enqueue("b", 2);

    expect(queue.dequeue()).toBe("a");
    expect(queue.dequeue()).toBe("b");
    expect(queue.dequeue()).toBe("c");
    expect(queue.empty()).toBe(true);
  });

  it("returns null when empty", () => {
    const queue = new PriorityQueue<string, number>((a, b) => a - b);
    expect(queue.dequeue()).toBeNull();
  });

  it("handles many interleaved enqueues correctly (heap invariant holds)", () => {
    const queue = new PriorityQueue<number, number>((a, b) => a - b);
    const values = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0];
    for (const value of values) queue.enqueue(value, value);

    const dequeued: number[] = [];
    while (!queue.empty()) {
      const value = queue.dequeue();
      if (value !== null) dequeued.push(value);
    }

    expect(dequeued).toEqual([...values].sort((a, b) => a - b));
  });
});

describe("vendored blocksuite graph", () => {
  it("finds axis-aligned neighbors on a simple grid with no obstacles", () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [10, 10, 0],
    ];
    const graph = new Graph(points);
    const neighbors = graph.neighbors([0, 0, 0]);

    // Should connect to (10,0) along x and (0,10) along y.
    expect(neighbors).toHaveLength(2);
    expect(neighbors).toContainEqual([10, 0, 0]);
    expect(neighbors).toContainEqual([0, 10, 0]);
  });

  it("excludes neighbor edges that cross a blocking bound", () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
    ];
    // A block sitting squarely between the two points on the x-axis edge.
    const block = new Bound(4, -2, 2, 4);
    const graph = new Graph(points, [block]);
    const neighbors = graph.neighbors([0, 0, 0]);

    expect(neighbors).toHaveLength(0);
  });
});

describe("vendored blocksuite AStarRunner", () => {
  // AStarRunner distinguishes the search start/end (sp/ep, must be members of
  // the graph's point set) from the "original" endpoints (originalSp/originalEp,
  // the true connector anchors) — mirroring how PathGenerator always calls it
  // with four distinct point objects. See a-star.ts's `_init`, which seeds
  // `_cameFrom` assuming `sp !== originalSp`.
  it("finds a direct path between two points with no obstacles", () => {
    const originalSp: [number, number, number] = [0, 0, 0];
    const originalEp: [number, number, number] = [10, 0, 0];
    const sp: [number, number, number] = [0, 0, 0];
    const ep: [number, number, number] = [10, 0, 0];
    const points: [number, number, number][] = [sp, ep];
    const runner = new AStarRunner(points, sp, ep, originalSp, originalEp);
    runner.run();

    const path = runner.path;
    expect(path[0]).toEqual(originalSp);
    expect(path[path.length - 1]).toEqual(originalEp);
  });

  it("routes around an obstacle via an intermediate waypoint", () => {
    const originalSp: [number, number, number] = [0, 0, 0];
    const originalEp: [number, number, number] = [20, 0, 0];
    const sp: [number, number, number] = [0, 0, 0];
    const ep: [number, number, number] = [20, 0, 0];
    const points: [number, number, number][] = [sp, ep, [0, 20, 0], [20, 20, 0]];
    const block = new Bound(5, -5, 10, 10);
    const runner = new AStarRunner(points, sp, ep, originalSp, originalEp, [block]);
    runner.run();

    const path = runner.path;
    expect(path[0]).toEqual(originalSp);
    expect(path[path.length - 1]).toEqual(originalEp);
    expect(path.length).toBeGreaterThan(2);
  });
});

describe("vendored blocksuite PathGenerator", () => {
  it("produces a direct path when neither endpoint is bound and there is no obstacle", () => {
    const generator = new PathGenerator();
    const path = generator.generateOrthogonalConnectorPath({
      startBound: null,
      endBound: null,
      startPoint: [0, 0],
      endPoint: [100, 0],
    });

    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual([0, 0]);
    expect(path[path.length - 1]).toEqual([100, 0]);
  });

  it("produces an orthogonal path between two bound rectangles", () => {
    const generator = new PathGenerator();
    const path = generator.generateOrthogonalConnectorPath({
      startBound: { x: 0, y: 0, w: 100, h: 60 },
      endBound: { x: 300, y: 0, w: 100, h: 60 },
      startPoint: [100, 30],
      endPoint: [300, 30],
    });

    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual([100, 30]);
    expect(path[path.length - 1]).toEqual([300, 30]);
    // Orthogonal: every consecutive pair shares an x or y coordinate.
    for (let i = 1; i < path.length; i += 1) {
      const [ax, ay] = path[i - 1]!;
      const [bx, by] = path[i]!;
      expect(ax === bx || ay === by).toBe(true);
    }
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      startBound: { x: 0, y: 0, w: 100, h: 60 },
      endBound: { x: 300, y: 200, w: 100, h: 60 },
      startPoint: [100, 30] as [number, number],
      endPoint: [300, 230] as [number, number],
    };

    const first = new PathGenerator().generateOrthogonalConnectorPath(input);
    const second = new PathGenerator().generateOrthogonalConnectorPath(input);

    expect(second).toEqual(first);
  });

  it("routes around an explicit obstacle rectangle placed between the endpoints", () => {
    const generator = new PathGenerator();
    const obstacle = { x: 140, y: -100, w: 40, h: 260 };
    const path = generator.generateOrthogonalConnectorPath({
      startBound: { x: 0, y: 0, w: 100, h: 60 },
      endBound: { x: 300, y: 0, w: 100, h: 60 },
      startPoint: [100, 30],
      endPoint: [300, 30],
      obstacles: [obstacle],
    });

    expect(path.length).toBeGreaterThanOrEqual(2);
    // No interior vertex of the path should land inside the obstacle rect.
    for (const [x, y] of path) {
      const insideObstacle =
        x > obstacle.x && x < obstacle.x + obstacle.w && y > obstacle.y && y < obstacle.y + obstacle.h;
      expect(insideObstacle).toBe(false);
    }
  });
});
