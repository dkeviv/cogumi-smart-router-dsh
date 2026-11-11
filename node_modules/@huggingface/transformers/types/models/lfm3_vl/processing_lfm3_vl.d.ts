export class Lfm3VlProcessor extends Processor {
    static tokenizer_class: typeof AutoTokenizer;
    static image_processor_class: typeof AutoImageProcessor;
    /**
     * @param {import('../../utils/image.js').RawImage|import('../../utils/image.js').RawImage[]|null} images
     * @param {string|string[]|null} [text]
     * @param {Record<string, any>} [kwargs]
     */
    _call(images: import("../../utils/image.js").RawImage | import("../../utils/image.js").RawImage[] | null, text?: string | string[] | null, kwargs?: Record<string, any>): Promise<any>;
}
import { Processor } from '../../processing_utils.js';
import { AutoTokenizer } from '../auto/tokenization_auto.js';
import { AutoImageProcessor } from '../auto/image_processing_auto.js';
//# sourceMappingURL=processing_lfm3_vl.d.ts.map