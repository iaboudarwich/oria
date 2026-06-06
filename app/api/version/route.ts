import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns the deployment's build identity so the client can detect when a
 * newer version has shipped and prompt a refresh. Never cached.
 */
export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return NextResponse.json({ version }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
