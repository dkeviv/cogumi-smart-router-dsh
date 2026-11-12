import { Tier } from '../types/index.js';
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
export declare function loadCentroids(centroidsPath: string): Map<string, RoutingCluster>;
export declare function saveCentroids(clusters: Map<string, RoutingCluster>, centroidsPath: string): void;
export declare function computeCentroids(clusters: RoutingCluster[], embedder: any): Promise<Map<string, Float32Array>>;
export declare const DEFAULT_CLUSTERS: RoutingCluster[];
//# sourceMappingURL=centroids.d.ts.map