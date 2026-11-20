import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from '@google/genai';
import type { Classification, Classifier, Embedder, Taxonomy } from '../types';
import { buildResponseSchema, buildSystemPrompt, buildUserPrompt, parseClassification } from './prompt';

/**
 * Gemini-backed classifier. Tries each model in order; transient failures (overload, timeouts,
 * rate limits) are retried with backoff before moving to the next model. If everything fails it
 * throws, and the caller sends the report to the triage queue instead of guessing.
 */
export class GeminiClassifier implements Classifier {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly models: string[],
    private readonly opts: { timeoutMs?: number; attemptsPerModel?: number } = {},
  ) {
    if (models.length === 0) throw new Error('GeminiClassifier needs at least one model');
    this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta', httpOptions: { timeout: opts.timeoutMs ?? 15_000 } });
  }

  async classify(text: string, taxonomy: Taxonomy): Promise<Classification> {
    const systemInstruction = buildSystemPrompt(taxonomy);
    const schema = buildResponseSchema(taxonomy);
    const errors: string[] = [];

    for (const model of this.models) {
      const attempts = this.opts.attemptsPerModel ?? 2;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const res = await this.ai.models.generateContent({
            model,
            contents: buildUserPrompt(text),
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseJsonSchema: schema,
              temperature: 0,
              ...thinkingFor(model),
            },
          });
          if (!res.text) throw new Error('empty response');
          return parseClassification(res.text, taxonomy, model, text);
        } catch (err) {
          errors.push(`${model}#${attempt + 1}: ${describe(err)}`);
          if (!isRetryable(err)) break; // bad request / bad output: try the next model
          if (statusOf(err) === 429) break; // quota is per model: switching beats waiting
          if (attempt < attempts - 1) await sleep(400 * 2 ** attempt + Math.random() * 300);
        }
      }
    }
    throw new Error(`All classifier models failed: ${errors.join(' | ')}`);
  }
}

export class GeminiEmbedder implements Embedder {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    readonly dimensions: number,
    opts: { timeoutMs?: number } = {},
  ) {
    this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta', httpOptions: { timeout: opts.timeoutMs ?? 10_000 } });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.ai.models.embedContent({
          model: this.model,
          contents: texts,
          config: { outputDimensionality: this.dimensions, taskType: 'SEMANTIC_SIMILARITY' },
        });
        const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
        if (vectors.length !== texts.length || vectors.some((v) => v.length !== this.dimensions)) {
          throw new Error(`embedding shape mismatch: got ${vectors.length} vectors for ${texts.length} texts`);
        }
        return vectors;
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err)) break;
        await sleep(400 * 2 ** attempt + Math.random() * 300);
      }
    }
    throw new Error(`Embedding failed: ${describe(lastErr)}`);
  }
}

function thinkingFor(model: string): Pick<GenerateContentConfig, 'thinkingConfig'> {
  // Classification doesn't benefit much from long reasoning; keep latency low for the student.
  if (model.startsWith('gemini-2.5')) return { thinkingConfig: { thinkingBudget: 0 } };
  if (model.startsWith('gemini-3')) return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  return {};
}

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

function isRetryable(err: unknown): boolean {
  const status = statusOf(err);
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500;
  const msg = describe(err).toLowerCase();
  return /timeout|timed out|aborted|fetch failed|econnreset|socket|network/.test(msg);
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300);
  return String(err).slice(0, 300);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
