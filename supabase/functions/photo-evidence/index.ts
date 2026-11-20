import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cleanup-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const bucket="downtime-evidence";
const maxBytes=5*1024*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if(action==="create-upload"){
    const entryKey=body?.entryKey, mime=body?.mimeType, size=Number(body?.size);
    if(!uuidPattern.test(entryKey||""))return json({error:"Invalid entry key"},400);
    if(!["image/jpeg","image/webp"].includes(mime))return json({error:"Unsupported image type"},415);
    if(!Number.isInteger(size)||size<1||size>maxBytes)return json({error:"File size must be 5MB or less"},413);
    const {data:existing}=await admin.from("downtime_attachments").select("id,storage_path,expires_at,status").eq("downtime_entry_key",entryKey).maybeSingle();
    if(existing&&existing.status==="available"&&new Date(existing.expires_at)>new Date())return json({error:"An active photo already exists for this entry"},409);
    const attachmentId=crypto.randomUUID(),path=entryKey+"/"+attachmentId+(mime==="image/webp"?".webp":".jpg");
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    if(existing?.storage_path){await admin.storage.from(bucket).remove([existing.storage_path]);await admin.from("downtime_attachments").delete().eq("id",existing.id);}
    const {data:upload,error:signError}=await admin.storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
    if(signError)return json({error:signError.message},500);
    const {error:insertError}=await admin.from("downtime_attachments").insert({id:attachmentId,downtime_entry_key:entryKey,storage_path:path,expires_at:expiresAt,status:"available",mime_type:mime,size_bytes:size});
    if(insertError){await admin.storage.from(bucket).remove([path]);return json({error:insertError.message},500)}
    return json({attachmentId,path,token:upload.token,signedUrl:upload.signedUrl,expiresAt});
  }
  if(action==="view"){
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
