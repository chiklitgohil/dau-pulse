import { after } from 'next/server';
import { getDb } from '@/db/client';
import { EMBEDDING_DIMENSIONS } from '@/db/schema';
import { GeminiClassifier, GeminiEmbedder } from '@/core/ai/gemini';
import { UnavailableClassifier, UnavailableEmbedder } from '@/core/ai/unavailable';
import { deliverOutbox } from '@/core/notify';
import { defaultCoreConfig, type Classifier, type Deps, type Embedder } from '@/core/types';
import { getEmailTransport } from './email';
import { env } from './env';

let ai: { classifier: Classifier; embedder: Embedder } | undefined;

function getAi() {
  if (ai) return ai;
  const e = env();
  if (!e.GEMINI_API_KEY) {
    console.warn('[deps] GEMINI_API_KEY not set: reports will skip AI and go to triage.');
    ai = { classifier: new UnavailableClassifier(), embedder: new UnavailableEmbedder(EMBEDDING_DIMENSIONS) };
  } else {
    const models = e.GEMINI_MODELS.split(',').map((m) => m.trim()).filter(Boolean);
    ai = {
      classifier: new GeminiClassifier(e.GEMINI_API_KEY, models),
      embedder: new GeminiEmbedder(e.GEMINI_API_KEY, e.GEMINI_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS),
    };
  }
  return ai;
}

/** Deliver queued emails right after the response is sent (cron retries anything that fails). */
export async function flushOutbox() {
  try {
    const db = await getDb();
    await deliverOutbox(db, getEmailTransport(), new Date());
  } catch (err) {
    console.error('[outbox] flush failed; cron will retry', err);
  }
}

export async function getDeps(): Promise<Deps> {
  const e = env();
  return {
    db: await getDb(),
    ...getAi(),
    now: () => new Date(),
    config: { ...defaultCoreConfig, appUrl: e.APP_URL, adminEmails: e.ADMIN_EMAILS },
    onEmailQueued: () => {
      try {
        after(flushOutbox);
      } catch {
        void flushOutbox(); // outside a request (scripts)
      }
    },
  };
}
