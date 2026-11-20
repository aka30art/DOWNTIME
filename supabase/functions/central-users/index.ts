import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const originAllowed = "https://aka30art.github.io";
const cors = {
  "Access-Control-Allow-Origin": originAllowed,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const enc=new TextEncoder();
function b64(bytes:Uint8Array){let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s)}
async function hashToken(token:string){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(token))))}
async function hashPassword(pin:string){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:600_000},key,256));
  return "pbkdf2-sha256$600000$"+b64(salt)+"$"+b64(derived);
}
const tiers=["ADMIN","MANAGER","SUPERVISOR","USER"];
const usernamePattern=/^[a-z0-9._-]{3,32}$/;

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return req.headers.get("origin")===originAllowed?new Response("ok",{headers:cors}):new Response("Forbidden",{status:403});
  if(req.headers.get("origin")!==originAllowed)return json({error:"Forbidden origin"},403);
  if(req.method!=="POST")return json({error:"POST only"},405);
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({error:"Server configuration missing"},500);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
  const token=req.headers.get("x-app-session")||String(body?.token||"");
  if(token.length<40||token.length>512)return json({error:"Session required"},401);
  const tokenHash=await hashToken(token);
  const {data:session,error:sErr}=await admin.from("downtime_auth_sessions").select("session_id,user_id,expires_at,revoked_at,downtime_app_users(user_id,username,display_name,tier,enabled)").eq("token_hash",tokenHash).maybeSingle();
  if(sErr||!session||session.revoked_at||new Date(session.expires_at)<=new Date()||!session.downtime_app_users?.enabled)return json({error:"Session invalid or expired"},401);
  const actor=session.downtime_app_users;
  if(!["OWNER","ADMIN"].includes(actor.tier))return json({error:"Administrator permission required"},403);
  const action=body?.action;
  if(action==="list"){
    const {data,error}=await admin.from("downtime_app_users").select("user_id,username,display_name,tier,enabled,created_at,updated_at").order("username");
    if(error)return json({error:"Could not retrieve users"},503);
    return json({users:data||[]});
  }
  if(action==="create"){
    const username=String(body?.username||"").trim().toLowerCase(),displayName=String(body?.displayName||"").trim(),pin=String(body?.pin||""),tier=String(body?.tier||"");
    if(!usernamePattern.test(username)||!displayName||displayName.length>80||!/^\\d{4,8}$/.test(pin)||!tiers.includes(tier))return json({error:"Invalid username, display name, password, or tier"},400);
    const passwordHash=await hashPassword(pin);
    const {data,error}=await admin.from("downtime_app_users").insert({username,display_name:displayName,password_hash:passwordHash,tier,enabled:true}).select("user_id,username,display_name,tier,enabled").single();
    if(error)return json({error:"User creation failed (username may already exist)"},409);
    await admin.from("downtime_sync_audit").insert({actor_id:actor.user_id,domain:"USERS",record_key:data.user_id,operation:"INSERT",new_data:{username,tier,enabled:true}});
    return json({user:data},201);
  }
  if(action==="update"){
    const userId=String(body?.userId||"");
    const {data:target,error:lookupError}=await admin.from("downtime_app_users").select("user_id,username,tier,enabled").eq("user_id",userId).maybeSingle();
    if(lookupError||!target)return json({error:"User not found"},404);
    if(target.tier==="OWNER"||target.username==="jan")return json({error:"OWNER account is protected"},403);
    const changes:any={updated_at:new Date().toISOString()};
    if(body?.username!==undefined){const username=String(body.username).trim().toLowerCase();if(!usernamePattern.test(username))return json({error:"Invalid username"},400);changes.username=username;}
    if(body?.displayName!==undefined){const name=String(body.displayName).trim();if(!name||name.length>80)return json({error:"Invalid display name"},400);changes.display_name=name;}
    if(body?.tier!==undefined){const tier=String(body.tier);if(!tiers.includes(tier))return json({error:"Invalid tier"},400);changes.tier=tier;}
    if(body?.enabled!==undefined){if(typeof body.enabled!=="boolean")return json({error:"Invalid enabled flag"},400);changes.enabled=body.enabled;}
    if(body?.pin!==undefined){const password=String(body.password);if(!/^\\d{4,8}$/.test(pin))return json({error:"Password must be 12–256 characters"},400);changes.password_hash=await hashPassword(password);}
    const {data,error}=await admin.from("downtime_app_users").update(changes).eq("user_id",userId).select("user_id,username,display_name,tier,enabled").single();
    if(error)return json({error:"User update failed"},409);
    if(changes.enabled===false||changes.password_hash||changes.tier)await admin.from("downtime_auth_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",userId).is("revoked_at",null);
    await admin.from("downtime_sync_audit").insert({actor_id:actor.user_id,domain:"USERS",record_key:userId,operation:"UPDATE",old_data:{username:target.username,tier:target.tier,enabled:target.enabled},new_data:{username:data.username,tier:data.tier,enabled:data.enabled}});
    return json({user:data});
  }
  if(action==="delete"){
    const userId=String(body?.userId||"");
    const {data:target,error:lookupError}=await admin.from("downtime_app_users").select("user_id,username,tier").eq("user_id",userId).maybeSingle();
    if(lookupError||!target)return json({error:"User not found"},404);
    if(target.tier==="OWNER"||target.username==="jan")return json({error:"OWNER account is protected"},403);
    const {error}=await admin.from("downtime_app_users").delete().eq("user_id",userId);
    if(error)return json({error:"User deletion failed"},409);
    await admin.from("downtime_sync_audit").insert({actor_id:actor.user_id,domain:"USERS",record_key:userId,operation:"DELETE",old_data:{username:target.username,tier:target.tier}});
    return json({ok:true});
  }
  return json({error:"Unknown action"},400);
});
