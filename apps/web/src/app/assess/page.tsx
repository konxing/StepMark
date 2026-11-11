import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {lookupSession,SESSION_COOKIE} from "@/server/security";
import AssessmentClient from "./assessment-client";
export const dynamic="force-dynamic";
export default async function AssessPage(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  const p=await lookupSession(token,"WEB");
  if(!p)redirect("/login");
  return <AssessmentClient/>;
}
