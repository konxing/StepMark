import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {lookupSession,SESSION_COOKIE} from "@/server/security";
import GrowthPracticeClient from "./growth-practice-client";

export const dynamic="force-dynamic";

export default async function GrowthPage(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!await lookupSession(token,"WEB"))redirect("/login?next=/growth");
  return <GrowthPracticeClient/>;
}
