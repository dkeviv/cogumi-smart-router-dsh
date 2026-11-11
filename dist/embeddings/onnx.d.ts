export interface EmbeddingResult {
    vector: Float32Array;
    tokens: number;
}
export declare class HyDRAEmbedder {
    private session;
    private modelPath;
    constructor(modelPath: string);
    initialize(): Promise<void>;
    embed(text: string): Promise<EmbeddingResult | null>;
    private tokenize;
    isReady(): boolean;
}
export declare function createHyDRAEmbedder(cacheDir: string): Promise<HyDRAEmbedder | null>;
//# sourceMappingURL=onnx.d.ts.map