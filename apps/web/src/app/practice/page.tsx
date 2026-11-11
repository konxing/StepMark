import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {lookupSession,SESSION_COOKIE} from "@/server/security";
import PracticeClient from "./practice-client";
export const dynamic="force-dynamic";
export default async function PracticePage(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  const user=await lookupSession(token,"WEB");
  if(!user)redirect("/login");
  return <PracticeClient/>;
}
