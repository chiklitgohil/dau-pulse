import type { Classification, Classifier, Embedder } from '../types';

/** Used when no API key is configured: every report goes to the triage queue for a human. */
export class UnavailableClassifier implements Classifier {
  async classify(): Promise<Classification> {
    throw new Error('No classifier configured (GEMINI_API_KEY missing)');
  }
}

export class UnavailableEmbedder implements Embedder {
  constructor(readonly dimensions: number) {}
  async embed(): Promise<number[][]> {
    throw new Error('No embedder configured (GEMINI_API_KEY missing)');
  }
}
