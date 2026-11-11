export class Lfm3VlImageProcessor extends Qwen2VLImageProcessor {
    _call(images: any, ...args: any[]): Promise<{
        pixel_values: import("../../transformers.js").Tensor;
        image_grid_thw: import("../../transformers.js").Tensor;
        original_sizes: any[];
        reshaped_input_sizes: any[];
    }>;
}
import { Qwen2VLImageProcessor } from '../qwen2_vl/image_processing_qwen2_vl.js';
//# sourceMappingURL=image_processing_lfm3_vl.d.ts.map