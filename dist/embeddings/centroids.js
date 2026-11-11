// src/embeddings/centroids.ts
// Cluster centroids for routing
export function loadCentroids(centroidsPath) {
    // Would load from JSON file
    const clusters = new Map();
    return clusters;
}
export function saveCentroids(clusters, centroidsPath) {
    // Would save to JSON file
}
export function computeCentroids(clusters, embedder) {
    // Would compute centroids from reference prompts
    return Promise.resolve(new Map());
}
export const DEFAULT_CLUSTERS = [
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
//# sourceMappingURL=centroids.js.map