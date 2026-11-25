import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://aka30art.github.io";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cleanup-secret, x-downtime-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const bucket="downtime-evidence";
const maxBytes=5*1024*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cryptoHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const digest=async(value:string)=>cryptoHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));

const tierDefaults:Record<string,{canEditTracker:boolean;canViewDashboards:boolean;canDeleteRecords:boolean}>={
  OWNER:{canEditTracker:true,canViewDashboards:true,canDeleteRecords:true},
  DEVACC:{canEditTracker:true,canViewDashboards:true,canDeleteRecords:true},
  ADMIN:{canEditTracker:true,canViewDashboards:true,canDeleteRecords:false},
  MANAGER:{canEditTracker:true,canViewDashboards:true,canDeleteRecords:false},
  SUPERVISOR:{canEditTracker:true,canViewDashboards:true,canDeleteRecords:false},
  USER:{canEditTracker:false,canViewDashboards:true,canDeleteRecords:false},
  SPECTATOR:{canEditTracker:false,canViewDashboards:false,canDeleteRecords:false},
};

async function resolveAccess(req:Request,admin:any){
  const token=req.headers.get("x-downtime-session")||"";
  if(token.length<32||token.length>256)return {error:"A valid DOWNTIME session is required.",status:401};
  const tokenHash=await digest(token);
  const {data:session,error:sessionError}=await admin
    .from("downtime_central_sessions")
    .select("username,expires_at")
    .eq("token_hash",tokenHash)
    .gt("expires_at",new Date().toISOString())
    .maybeSingle();
  if(sessionError)return {error:"Session verification is temporarily unavailable.",status:503};
  if(!session)return {error:"DOWNTIME session expired. Sign in again.",status:401};

  const {data:bankRow,error:bankError}=await admin
    .from("downtime_central_bank")
    .select("payload")
    .eq("id",1)
    .maybeSingle();
  if(bankError||!bankRow?.payload)return {error:"Central account verification is unavailable.",status:503};

  const payload=bankRow.payload;
  const username=String(session.username||"").toLowerCase();
  const user=Array.isArray(payload.users)
    ? payload.users.find((item:any)=>String(item?.username||"").toLowerCase()===username&&item?.enabled!==false)
    : null;
  if(!user)return {error:"DOWNTIME account is disabled or unavailable.",status:401};

  const tier=String(user.tier||"");
  const defaults=tierDefaults[tier];
  if(!defaults)return {error:"Account tier is not authorised for photo evidence.",status:403};
  const saved=payload.tiers?.[tier]&&typeof payload.tiers[tier]==="object"?payload.tiers[tier]:{};
  const root=tier==="OWNER"||tier==="DEVACC";
  return {
    username:user.username,
    tier,
    canEditTracker:root?true:(typeof saved.canEditTracker==="boolean"?saved.canEditTracker:defaults.canEditTracker),
    canViewDashboards:root?true:(typeof saved.canViewDashboards==="boolean"?saved.canViewDashboards:defaults.canViewDashboards),
    canDeleteRecords:root?true:(typeof saved.canDeleteRecords==="boolean"?saved.canDeleteRecords:defaults.canDeleteRecords),
  };
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST only"},405);

  const url=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey) return json({error:"Server configuration missing"},500);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}});

  let body:any;
  try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
  const action=body?.action;

  if(action==="cleanup"){
    const secret=Deno.env.get("PHOTO_CLEANUP_SECRET");
    if(!secret||req.headers.get("x-cleanup-secret")!==secret) return json({error:"Forbidden"},403);
    const {data:expired,error}=await admin.from("downtime_attachments").select("id,storage_path").lte("expires_at",new Date().toISOString()).neq("status","deleted").limit(1000);
    if(error)return json({error:error.message},500);
    let deleted=0,failed=0;
    for(const row of expired||[]){
      const {error:storageError}=await admin.storage.from(bucket).remove([row.storage_path]);
      if(storageError){failed++;continue}
      const {error:updateError}=await admin.from("downtime_attachments").update({status:"deleted",deleted_at:new Date().toISOString()}).eq("id",row.id);
      if(updateError)failed++;else deleted++;
    }
    return json({deleted,failed});
  }

  const access=await resolveAccess(req,admin);
  if("error" in access)return json({error:access.error},access.status);

  if(action==="create-upload"){
    if(!access.canEditTracker)return json({error:"Tracker edit permission is required to upload photo evidence."},403);
    const entryKey=body?.entryKey, mime=body?.mimeType, size=Number(body?.size);
    if(!uuidPattern.test(entryKey||""))return json({error:"Invalid entry key"},400);
    if(!["image/jpeg","image/webp"].includes(mime))return json({error:"Unsupported image type"},415);
    if(!Number.isInteger(size)||size<1||size>maxBytes)return json({error:"File size must be 5MB or less"},413);
    const {data:existing}=await admin.from("downtime_attachments").select("id,storage_path,expires_at,status").eq("downtime_entry_key",entryKey).maybeSingle();
    if(existing&&existing.status==="available"&&new Date(existing.expires_at)>new Date())return json({error:"An active photo already exists for this entry"},409);
    const attachmentId=crypto.randomUUID(),path=entryKey+"/"+attachmentId+(mime==="image/webp"?".webp":".jpg");
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    if(existing?.storage_path){
      const {error:removeError}=await admin.storage.from(bucket).remove([existing.storage_path]);
      if(removeError)return json({error:"Could not replace the expired photo."},500);
      const {error:deleteError}=await admin.from("downtime_attachments").delete().eq("id",existing.id);
      if(deleteError)return json({error:"Could not replace the expired photo record."},500);
    }
    const {data:upload,error:signError}=await admin.storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
    if(signError)return json({error:signError.message},500);
    const {error:insertError}=await admin.from("downtime_attachments").insert({id:attachmentId,downtime_entry_key:entryKey,storage_path:path,expires_at:expiresAt,status:"available",mime_type:mime,size_bytes:size});
    if(insertError){await admin.storage.from(bucket).remove([path]);return json({error:insertError.message},500)}
    return json({attachmentId,path,token:upload.token,signedUrl:upload.signedUrl,expiresAt});
  }

  if(action==="view"){
    if(!access.canViewDashboards)return json({error:"Dashboard view permission is required to view photo evidence."},403);
    const id=body?.attachmentId;
    if(!uuidPattern.test(id||""))return json({error:"Invalid attachment id"},400);
    const {data:row,error}=await admin.from("downtime_attachments").select("storage_path,expires_at,status").eq("id",id).maybeSingle();
    if(error)return json({error:error.message},500);
    if(!row||row.status!=="available"||new Date(row.expires_at)<=new Date())return json({error:"Photo expired or unavailable"},410);
    const {data,error:signError}=await admin.storage.from(bucket).createSignedUrl(row.storage_path,60);
    if(signError)return json({error:signError.message},500);
    return json({url:data.signedUrl,expiresIn:60});
  }

  if(action==="delete"){
    if(!access.canDeleteRecords)return json({error:"Record deletion permission is required to delete photo evidence."},403);
    const id=body?.attachmentId;
    if(!uuidPattern.test(id||""))return json({error:"Invalid attachment id"},400);
    const {data:row,error}=await admin.from("downtime_attachments").select("id,storage_path").eq("id",id).maybeSingle();
    if(error)return json({error:error.message},500);
    if(!row)return json({ok:true});
    const {error:removeError}=await admin.storage.from(bucket).remove([row.storage_path]);
    if(removeError)return json({error:removeError.message},500);
    const {error:updateError}=await admin.from("downtime_attachments").update({status:"deleted",deleted_at:new Date().toISOString()}).eq("id",id);
    if(updateError)return json({error:updateError.message},500);
    return json({ok:true});
  }

  return json({error:"Unknown action"},400);
});
