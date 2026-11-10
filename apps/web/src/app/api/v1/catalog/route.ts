import { NextResponse } from "next/server";
import { initialConstructs } from "@stepmark/core";
/** Public metadata ONLY: no user data, scores, behavioral observations, or secrets. */
export function GET() {
  return NextResponse.json({ version: "v1", constructs: initialConstructs },
    { headers: {"Cache-Control": "public, max-age=300", "X-Content-Type-Options":"nosniff"} });
}
