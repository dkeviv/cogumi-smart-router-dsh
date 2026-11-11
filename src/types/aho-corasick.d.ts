// src/types/aho-corasick.d.ts
declare module 'aho-corasick' {
  export interface Match {
    word: string;
    index: number;
    output: any;
  }

  export class AhoCorasick {
    add(word: string, output: any): void;
    build(): void;
    search(text: string): Match[];
    remove(word: string): void;
  }

  export default AhoCorasick;
}