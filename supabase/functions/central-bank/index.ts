import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigin="https://aka30art.github.io";
const headers={"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-downtime-session","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Vary":"Origin","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const tiers=["OWNER","ADMIN","MANAGER","SUPERVISOR","USER","SPECTATOR"];
const tierDefault:Record<string,Record<string,boolean>>={
 OWNER:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageSettings:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 ADMIN:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageSettings:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 MANAGER:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 SUPERVISOR:{canEditTracker:true,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 USER:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 SPECTATOR:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:false,canViewAssignments:false,canViewDashboards:false,canViewReports:false}
};
const cryptoHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const digest=async(s:string)=>cryptoHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
async function hashPin(pin:string,salt:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);return cryptoHex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:150000,hash:"SHA-256"},key,256)))}
async function verifyPin(pin:string,user:any){return user?.pinSalt&&user?.pinHash&&await hashPin(pin,user.pinSalt)===user.pinHash}
function safeUser(u:any){return {username:u.username,tier:u.tier,enabled:u.enabled!==false,displayName:u.displayName||u.username}}
function normalizeBank(p:any){const b=p||{};b.appData=b.appData||{};b.users=Array.isArray(b.users)?b.users:[];b.tiers=b.tiers||structuredClone(tierDefault);b.staff=b.staff||{roster:[],profiles:{}};b.statsSource=b.statsSource||{weeks:b.appData.weeks||{}};return b}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS"){if(req.headers.get("origin")&&req.headers.get("origin")!==allowedOrigin)return new Response("Forbidden",{status:403});return new Response("ok",{headers})}
 if(req.headers.get("origin")&&req.headers.get("origin")!==allowedOrigin)return json({error:"Origin denied"},403);
 if(req.method!=="POST")return json({error:"POST only"},405);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({error:"Server config missing"},500);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:any;try{body=await req.json()}catch{return json({error:"Bad JSON"},400)}
 const action=body?.action;
 const {data:row,error:loadErr}=await db.from("downtime_central_bank").select("payload,version,updated_at").eq("id",1).maybeSingle();
 if(loadErr)return json({error:"Central data bank unavailable"},500);
 let bank=normalizeBank(row?.payload);
 if(action==="bootstrap"){
   const setupCode=Deno.env.get("DOWNTIME_BOOTSTRAP_CODE");if(!setupCode||typeof body.bootstrapCode!=="string"||body.bootstrapCode!==setupCode)return json({error:"Bootstrap code invalid or not configured"},401);
   if(bank.users.some((u:any)=>u.enabled!==false))return json({error:"Bootstrap already completed"},409);
   const username=String(body.username||"").trim().slice(0,32),pin=String(body.pin||"");
   if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)||!/^[0-9]{4,8}$/.test(pin))return json({error:"Username 2-32 characters; PIN 4-8 digits required"},400);
   const salt=cryptoHex(crypto.getRandomValues(new Uint8Array(16)));
   bank.users=[{username,displayName:username,tier:"OWNER",enabled:true,pinSalt:salt,pinHash:await hashPin(pin,salt)}];
   const {data:bootWrite,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",row?.version||0).select("id").maybeSingle();
   if(error||!bootWrite)return json({error:"Bootstrap conflict; refresh and retry"},409);
   await db.from("downtime_central_audit").insert({username,action:"bootstrap",details:{}});
   return json({ok:true,message:"Owner account initialized. Sign in."});
 }
 if(action==="list-users"){return json({users:bank.users.filter((u:any)=>u.enabled!==false).map((u:any)=>({username:u.username,displayName:u.displayName||u.username,tier:u.tier}))});}
 if(action==="login"){
   const username=String(body.username||"").trim(),pin=String(body.pin||"");
   if(pin.length>8||!username)return json({error:"Invalid credentials"},401);
   const user=bank.users.find((u:any)=>u.username.toLowerCase()===username.toLowerCase()&&u.enabled!==false);
   if(!user||!await verifyPin(pin,user))return json({error:"Invalid username or PIN"},401);
   const token=cryptoHex(crypto.getRandomValues(new Uint8Array(32))),tokenHash=await digest(token),expires=new Date(Date.now()+12*60*60*1000);
   const {error}=await db.from("downtime_central_sessions").insert({token_hash:tokenHash,username:user.username,tier:user.tier,expires_at:expires.toISOString()});
   if(error)return json({error:"Session creation failed"},500);
   await db.from("downtime_central_audit").insert({username:user.username,action:"login",details:{}});
   return json({token,expiresAt:expires.toISOString(),user:safeUser(user)});
 }
 const token=req.headers.get("x-downtime-session")||"",tokenHash=await digest(token);
 const {data:session}=await db.from("downtime_central_sessions").select("username,tier,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(!session)return json({error:"Session expired. Sign in again."},401);
 const currentUser=bank.users.find((u:any)=>u.username===session.username&&u.enabled!==false);
 if(!currentUser)return json({error:"Account disabled"},401);
 const tier=currentUser.tier,priv=bank.tiers[tier]||tierDefault[tier]||{};
 if(action==="get-state"){const publicBank={...bank,users:bank.users.map(safeUser)};const restrictedData={...(publicBank.appData||{})};if(!priv.canViewStaff){publicBank.staff={roster:[],profiles:{}};delete restrictedData.staffRoster;delete restrictedData.operatorProfiles;delete restrictedData.assignments;if(restrictedData.weeks){for(const weekData of Object.values(restrictedData.weeks) as any[]){for(const dayData of (weekData?.days||[])){delete dayData.operator;}}}}if(!priv.canViewDashboards){delete restrictedData.weeks;delete restrictedData.areas;delete restrictedData.reasons;delete restrictedData.quickReasons;delete restrictedData.archive;}if(!priv.canViewReports)delete restrictedData.archive;publicBank.appData=restrictedData;publicBank.statsSource={weeks:priv.canViewDashboards?(restrictedData.weeks||{}):{}};return json({payload:publicBank,user:safeUser(currentUser),version:row?.version||0,updatedAt:row?.updated_at});}
 if(action==="save-state"){
   if(!priv.canEditTracker)return json({error:"Permission denied"},403);
   const incoming=body?.appData;if(!incoming||typeof incoming!=="object"||Array.isArray(incoming))return json({error:"appData required"},400);
   const nextAppData={...incoming};
   if(!priv.canManageSettings){for(const field of ["areas","reasons","quickReasons"]){if(field in (bank.appData||{}))nextAppData[field]=bank.appData[field];}}
   if(!priv.canManageStaff){nextAppData.operatorProfiles=bank.appData?.operatorProfiles||bank.staff?.profiles||{};nextAppData.staffRoster=bank.appData?.staffRoster||bank.staff?.roster||[];}
   else{bank.staff.profiles=nextAppData.operatorProfiles||bank.staff.profiles||{};bank.staff.roster=Array.isArray(nextAppData.staffRoster)?nextAppData.staffRoster:(bank.staff.roster||[]);}
   if(!priv.canViewReports)nextAppData.archive=bank.appData?.archive||[];
   bank.appData=nextAppData;bank.statsSource={weeks:nextAppData.weeks||{}};
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict; refresh before saving"},409);
   return json({version:(row?.version||0)+1,updatedAt:new Date().toISOString()});
 }
 if(action==="users"){
   if(!priv.canManageUsers)return json({error:"Permission denied"},403);
   return json({users:bank.users.map(safeUser),tiers:bank.tiers});
 }
 if(action==="user-save"){
   if(!priv.canManageUsers)return json({error:"Permission denied"},403);
   const username=String(body.username||"").trim(),displayName=String(body.displayName||username).trim(),newTier=String(body.tier||"USER"),pin=String(body.pin||"");
   if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)||!tiers.includes(newTier))return json({error:"Invalid user/tier"},400);
   const idx=bank.users.findIndex((u:any)=>u.username.toLowerCase()===username.toLowerCase());
   if(newTier==="OWNER"&&tier!=="OWNER")return json({error:"Only OWNER can assign OWNER tier"},403);if(idx>=0&&bank.users[idx].tier==="OWNER"&&tier!=="OWNER")return json({error:"Only OWNER can modify OWNER account"},403);
   let user=idx>=0?bank.users[idx]:{username};
   user.username=username;user.displayName=displayName;user.tier=newTier;user.enabled=body.enabled!==false;
   if(pin){if(!/^[0-9]{4,8}$/.test(pin))return json({error:"PIN must be 4-8 digits"},400);user.pinSalt=cryptoHex(crypto.getRandomValues(new Uint8Array(16)));user.pinHash=await hashPin(pin,user.pinSalt)}
   if(idx>=0)bank.users[idx]=user;else{if(!pin)return json({error:"PIN required for new user"},400);bank.users.push(user)}
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"user-save",details:{target:username,tier:newTier}});
   return json({ok:true,version:(row?.version||0)+1});
 }
 if(action==="user-delete"){
   if(!priv.canManageUsers)return json({error:"Permission denied"},403);
   const target=String(body.username||"");if(target===currentUser.username)return json({error:"Cannot delete your own account"},400);
   const victim=bank.users.find((u:any)=>u.username===target);if(victim?.tier==="OWNER"&&tier!=="OWNER")return json({error:"OWNER only"},403);
   bank.users=bank.users.filter((u:any)=>u.username!==target);
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"user-delete",details:{target}});
   return json({ok:true,version:(row?.version||0)+1});
 }
 if(action==="staff-save"){
   if(!priv.canManageStaff)return json({error:"Permission denied"},403);
   const name=String(body.name||"").trim();if(!name||name.length>80)return json({error:"Staff name required"},400);
   bank.staff.profiles=bank.staff.profiles||{};bank.staff.roster=bank.staff.roster||[];
   bank.staff.profiles[name]={...(bank.staff.profiles[name]||{}),...(body.profile||{}),name};
   if(!bank.staff.roster.includes(name))bank.staff.roster.push(name);
   bank.appData.operatorProfiles=bank.appData.operatorProfiles||{};bank.appData.operatorProfiles[name]=bank.staff.profiles[name];
   bank.appData.staffRoster=bank.staff.roster.slice();
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"staff-save",details:{name}});
   return json({ok:true,version:(row?.version||0)+1});
 }
 if(action==="staff-photo-url"){
   if(!priv.canManageStaff)return json({error:"Permission denied"},403);
   const name=String(body.name||"").trim();if(!name)return json({error:"Staff name required"},400);
   const path=name.toLowerCase().replace(/[^a-z0-9_-]/g,"-")+"/"+crypto.randomUUID();
   const {data,error}=await db.storage.from("downtime-staff-photos").createSignedUploadUrl(path);
   if(error)return json({error:error.message},500);
   return json({path,token:data.token,signedUrl:data.signedUrl});
 }
 if(action==="staff-photo-read"){
   const path=String(body.path||"");if(!path||path.length>300)return json({error:"Invalid path"},400);
   if(!priv.canViewStaff)return json({error:"Permission denied"},403);
   const {data,error}=await db.storage.from("downtime-staff-photos").createSignedUrl(path,120);
   if(error)return json({error:error.message},404);
   return json({url:data.signedUrl});
 }
 if(action==="set-plant-status"){
   if(!priv.canEditTracker)return json({error:"Permission denied"},403);
   if(typeof body.plantOn!=="boolean")return json({error:"plantOn must be boolean"},400);
   bank.appData=bank.appData||{};
   bank.appData.plantOn=body.plantOn;
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict; refresh before changing plant status"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"set-plant-status",details:{plantOn:body.plantOn}});
   return json({version:(row?.version||0)+1,updatedAt:new Date().toISOString()});
 }
 if(action==="tiers-save"){
   if(tier!=="OWNER")return json({error:"OWNER only"},403);
   const proposed=body.tiers;if(!proposed||typeof proposed!=="object")return json({error:"Tiers required"},400);
   bank.tiers=proposed;
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict"},409);
   return json({ok:true,version:(row?.version||0)+1});
 }
 if(action==="logout"){await db.from("downtime_central_sessions").delete().eq("token_hash",tokenHash);return json({ok:true});}
 return json({error:"Unknown action"},400);
});
