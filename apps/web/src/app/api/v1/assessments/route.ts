import { NextResponse } from "next/server";
/** Never enable anonymous score submission or AI judging on a public deployment. */
export function POST() {
  return NextResponse.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Assessment submission requires authentication and audit trails." } },
    { status: 501, headers: {"Cache-Control":"no-store"} }
  );
}
