/**
 * Plain geometry/edge shapes shared across board/ and service/ where the
 * full canvas schema types are unnecessary (render crops, delta regions,
 * lint geometry). Deliberately dependency-free.
 */
export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface Edge {
  from: string;
  to: string;
}
