import {NextResponse} from "next/server";
import {initialConstructs} from "@stepmark/core";
/** Public metadata is static; do not perform any user database lookup here. */
export const dynamic="force-static";
export const revalidate=3600;
export function GET(){
  return NextResponse.json({version:"v1",constructs:initialConstructs},{
    headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=300",
      "X-Content-Type-Options":"nosniff"}
  });
}
