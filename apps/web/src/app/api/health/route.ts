import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({ status: "ok", service: "stepmark-web", apiVersion: "v1" },
    {headers: {"Cache-Control": "no-store"}});
}
