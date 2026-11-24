export const WINDOWS_LOCAL_ORIGIN="http://127.0.0.1:8080";

export function usesWindowsLocalOrigin(env:NodeJS.ProcessEnv=process.env):boolean{
  return env.STEPMARK_INGRESS_MODE==="windows-local"&&env.APP_ORIGIN===WINDOWS_LOCAL_ORIGIN;
}
