import { NextResponse } from "next/server";
/** Fail closed until server verified identity, CSRF controls, rate limits, and storage are implemented. */
const unavailable = () => NextResponse.json(
  { error: { code: "NOT_IMPLEMENTED", message: "Authenticated observations API is not enabled." } },
  { status: 501, headers: { "Cache-Control": "no-store" } }
);
export const GET = unavailable;
export const POST = unavailable;
