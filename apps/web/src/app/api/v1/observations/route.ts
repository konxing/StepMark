import { NextResponse } from "next/server";
/** Fail closed until identity, CSRF, rate limits, and storage are implemented. */
export function GET() {
  return NextResponse.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Authenticated observations API is not enabled." } },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}
export function POST() {
  return NextResponse.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Authenticated observations API is not enabled." } },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}
