import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {lookupSession,SESSION_COOKIE} from "@/server/security";
import SettingsClient from "./settings-client";
export const dynamic="force-dynamic";
export default async function SettingsPage(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  const p=await lookupSession(token,"WEB");
  if(!p)redirect("/login");
  return <SettingsClient email={p.email??""}/>;
}
