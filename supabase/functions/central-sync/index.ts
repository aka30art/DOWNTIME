import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://aka30art.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers});
const enc = new TextEncoder();
async function tokenHash(token:string){return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(token)))));}
async function validate(admin:any,token:string){
  if(!token||token.length<40||token.length>512)return null;
  const hash=await tokenHash(token);
  const {data,error}=await admin.from("downtime_auth_sessions").select("session_id,user_id,expires_at,revoked_at,downtime_app_users(user_id,username,display_name,tier,enabled)").eq("token_hash",hash).maybeSingle();
  if(error||!data||data.revoked_at||new Date(data.expires_at)<=new Date())return null;
  const user=data.downtime_app_users;
  if(!user?.enabled)return null;
  return {user,session:data};
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return req.headers.get("origin")===allowedOrigin?new Response("ok",{headers}):new Response("Forbidden",{status:403});
  if(req.headers.get("origin")!==allowedOrigin)return reply({error:"Forbidden origin"},403);
  if(req.method!=="POST")return reply({error:"POST only"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply({error:"Server configuration missing"},500);
  let body:any;try{body=await req.json()}catch{return reply({error:"Invalid JSON"},400)}
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=req.headers.get("x-app-session")||String(body?.token||"");
  const validated=await validate(admin,token);
  if(!validated)return reply({error:"Session invalid or expired"},401);
  const {user}=validated;
  const action=String(body?.action||"read");
  if(action==="read"){
    const {data,error}=await admin.from("downtime_shared_state").select("payload,updated_at,version").eq("id",1).maybeSingle();
    if(error)return reply({error:"Shared state read failed"},503);
    return reply({payload:data?.payload??null,version:data?.version??0,updatedAt:data?.updated_at??null});
  }
  if(action==="write"){
    if(!["OWNER","ADMIN","SUPERVISOR"].includes(user.tier))return reply({error:"Read-only tier"},403);
    const expected=body?.expectedVersion;
    const payload=body?.payload;
    if(!Number.isSafeInteger(expected)||expected<0||!payload||typeof payload!=="object"||Array.isArray(payload)||JSON.stringify(payload).length>1_500_000)return reply({error:"Invalid payload/version"},400);
    const {data,error}=await admin.rpc("downtime_shared_state_cas",{p_expected_version:expected,p_payload:payload,p_actor_id:user.user_id});
    if(error)return reply({error:"Shared state write failed"},503);
    const result=Array.isArray(data)?data[0]:data;
    if(!result?.ok)return reply({conflict:true,currentVersion:result?.current_version??null,currentPayload:result?.current_payload??null},409);
    return reply({ok:true,version:result.current_version,payload:result.current_payload});
  }
  return reply({error:"Unknown action"},400);
});
