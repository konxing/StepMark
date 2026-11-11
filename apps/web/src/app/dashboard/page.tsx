import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {lookupSession,SESSION_COOKIE} from "@/server/security";
import DashboardClient from "./dashboard-client";
export const dynamic="force-dynamic";
export default async function DashboardPage() {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  const principal=await lookupSession(token,"WEB");
  if(!principal) redirect("/login");
  return <DashboardClient email={principal.email??""}/>;
}
