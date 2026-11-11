// src/embeddings/centroids.ts
// Cluster centroids for routing

import { ModelProfile, Tier } from '../types';

export interface RoutingCluster {
  id: string;
  tierBias: Tier;
  referencePrompts: string[];
  minSimilarity: number;
  minMargin: number;
  centroid?: Float32Array;
  referenceCount: number;
}

export interface CentroidData {
  clusterId: string;
  tierBias: Tier;
  centroid: number[];
  referenceCount: number;
}

export function loadCentroids(centroidsPath: string): Map<string, RoutingCluster> {
  // Would load from JSON file
  const clusters = new Map<string, RoutingCluster>();
  return clusters;
}

export function saveCentroids(clusters: Map<string, RoutingCluster>, centroidsPath: string): void {
  // Would save to JSON file
}

export function computeCentroids(
  clusters: RoutingCluster[],
  embedder: any
): Promise<Map<string, Float32Array>> {
  // Would compute centroids from reference prompts
  return Promise.resolve(new Map());
}

export const DEFAULT_CLUSTERS: RoutingCluster[] = [
  {
    id: 'low_stakes_general',
    tierBias: 'zero-tier',
    referencePrompts: [
      'format this json',
      'fix typo in comment',
      'add jsdoc to function',
      'lint this file',
      'write unit test for utils',
    ],
    minSimilarity: 0.3,
    minMargin: 0.1,
    referenceCount: 5,
  },
  {
    id: 'code_generation',
    tierBias: 'economical-cloud',
    referencePrompts: [
      'implement a rest api',
      'create a react component',
      'write a database migration',
      'add authentication middleware',
    ],
    minSimilarity: 0.35,
    minMargin: 0.1,
    referenceCount: 4,
  },
  {
    id: 'architecture',
    tierBias: 'frontier-cloud',
    referencePrompts: [
      'design system architecture',
      'review this design for scalability',
      'analyze race condition in distributed system',
      'plan microservices migration',
    ],
    minSimilarity: 0.4,
    minMargin: 0.15,
    referenceCount: 4,
  },
  {
    id: 'debugging',
    tierBias: 'frontier-cloud',
    referencePrompts: [
      'debug memory leak',
      'fix race condition',
      'analyze performance bottleneck',
      'trace deadlock',
    ],
    minSimilarity: 0.4,
    minMargin: 0.15,
    referenceCount: 4,
  },
];