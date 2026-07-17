import { fibSquaresAlgorithm } from "./fib-squares";
import { goldenCascadeAlgorithm } from "./golden-cascade";
import { heroCascadeAlgorithm } from "./hero-cascade";
import { medianKdAlgorithm } from "./median-kd";
import { mondrianAlgorithm } from "./mondrian";
import { mondrianGoldenAlgorithm } from "./mondrian-golden";
import { mondrianStreetsAlgorithm } from "./mondrian-streets";
import { radialRingsAlgorithm } from "./radial-rings";
import { squarifiedAlgorithm } from "./squarified";
import { streetGridAlgorithm } from "./street-grid";
import { voronoiLloydAlgorithm } from "./voronoi-lloyd";

export const STRUCTURE_ALGORITHMS = [
  fibSquaresAlgorithm,
  goldenCascadeAlgorithm,
  streetGridAlgorithm,
  mondrianAlgorithm,
  mondrianGoldenAlgorithm,
  mondrianStreetsAlgorithm,
  heroCascadeAlgorithm,
  medianKdAlgorithm,
  squarifiedAlgorithm,
  voronoiLloydAlgorithm,
  radialRingsAlgorithm,
] as const;

export const STRUCTURE_ALGORITHM_BY_ID = new Map(
  STRUCTURE_ALGORITHMS.map((algorithm) => [algorithm.id, algorithm]),
);
