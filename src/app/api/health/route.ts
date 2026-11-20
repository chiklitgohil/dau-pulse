import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';

export const dynamic = 'force-dynamic';

/** For uptime monitors: 200 when the app can reach its database. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[health] database check failed', err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
