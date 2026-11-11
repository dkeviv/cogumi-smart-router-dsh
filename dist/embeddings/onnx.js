// src/embeddings/onnx.ts
// ONNX embeddings for HyDRA-style semantic matching
import { InferenceSession, Tensor } from 'onnxruntime-node';
export class HyDRAEmbedder {
    session = null;
    modelPath;
    constructor(modelPath) {
        this.modelPath = modelPath;
    }
    async initialize() {
        try {
            this.session = await InferenceSession.create(this.modelPath);
        }
        catch (error) {
            console.warn('[smart-router] Failed to load ONNX embedder:', error);
            this.session = null;
        }
    }
    async embed(text) {
        if (!this.session)
            return null;
        try {
            // Tokenize text (simplified - would use proper tokenizer)
            const tokens = this.tokenize(text);
            const inputIds = new Tensor('int64', BigInt64Array.from(tokens), [1, tokens.length]);
            const attentionMask = new Tensor('int64', BigInt64Array.from(tokens.map(() => 1n)), [1, tokens.length]);
            const feeds = {
                input_ids: inputIds,
                attention_mask: attentionMask,
            };
            const results = await this.session.run(feeds);
            const embeddings = results.output || results.last_hidden_state;
            if (!embeddings)
                return null;
            // Mean pooling
            const data = embeddings.data;
            const seqLen = tokens.length;
            const hiddenSize = data.length / seqLen;
            const pooled = new Float32Array(hiddenSize);
            for (let i = 0; i < hiddenSize; i++) {
                let sum = 0;
                for (let j = 0; j < seqLen; j++) {
                    sum += data[j * hiddenSize + i];
                }
                pooled[i] = sum / seqLen;
            }
            // L2 normalize
            const norm = Math.sqrt(pooled.reduce((sum, v) => sum + v * v, 0));
            for (let i = 0; i < pooled.length; i++) {
                pooled[i] /= norm || 1;
            }
            return { vector: pooled, tokens: tokens.length };
        }
        catch (error) {
            console.warn('[smart-router] Embedding failed:', error);
            return null;
        }
    }
    tokenize(text) {
        // Simplified tokenization - would use tiktoken in production
        // This is just a placeholder
        const words = text.toLowerCase().split(/\s+/);
        return words.map((_, i) => BigInt(i % 30000));
    }
    isReady() {
        return this.session !== null;
    }
}
export async function createHyDRAEmbedder(cacheDir) {
    const modelPath = `${cacheDir}/models/onnx/model.onnx`;
    const embedder = new HyDRAEmbedder(modelPath);
    await embedder.initialize();
    return embedder.isReady() ? embedder : null;
}
//# sourceMappingURL=onnx.js.map