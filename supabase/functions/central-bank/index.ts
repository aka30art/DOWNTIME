import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigin="https://aka30art.github.io";
const headers={"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-downtime-session","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Vary":"Origin","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const tiers=["OWNER","DEVACC","ADMIN","MANAGER","SUPERVISOR","USER","SPECTATOR"];
const tierDefault:Record<string,Record<string,boolean>>={
 OWNER:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageAssignments:true,canManageSettings:true,canViewUsers:true,canViewAreaPresets:true,canManageAreaPresets:true,canViewReasonPresets:true,canManageReasonPresets:true,canViewShiftSchedule:true,canManageShiftSchedule:true,canViewDailyTasks:true,canManageDailyTasks:true,canAddDowntimeReasons:true,canDeleteRecords:true,canExportReports:true,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 DEVACC:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageAssignments:true,canManageSettings:true,canViewUsers:true,canViewAreaPresets:true,canManageAreaPresets:true,canViewReasonPresets:true,canManageReasonPresets:true,canViewShiftSchedule:true,canManageShiftSchedule:true,canViewDailyTasks:true,canManageDailyTasks:true,canAddDowntimeReasons:true,canDeleteRecords:true,canExportReports:true,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 ADMIN:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageAssignments:true,canManageSettings:true,canViewUsers:true,canViewAreaPresets:true,canManageAreaPresets:true,canViewReasonPresets:true,canManageReasonPresets:true,canViewShiftSchedule:true,canManageShiftSchedule:true,canViewDailyTasks:true,canManageDailyTasks:true,canAddDowntimeReasons:true,canDeleteRecords:false,canExportReports:true,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 MANAGER:{canEditTracker:true,canManageUsers:false,canManageStaff:false,canManageAssignments:false,canManageSettings:false,canViewUsers:false,canViewAreaPresets:false,canManageAreaPresets:false,canViewReasonPresets:false,canManageReasonPresets:false,canViewShiftSchedule:false,canManageShiftSchedule:false,canViewDailyTasks:false,canManageDailyTasks:false,canAddDowntimeReasons:false,canDeleteRecords:false,canExportReports:true,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 SUPERVISOR:{canEditTracker:true,canManageUsers:false,canManageStaff:true,canManageAssignments:true,canManageSettings:false,canViewUsers:false,canViewAreaPresets:false,canManageAreaPresets:false,canViewReasonPresets:true,canManageReasonPresets:false,canViewShiftSchedule:false,canManageShiftSchedule:false,canViewDailyTasks:false,canManageDailyTasks:false,canAddDowntimeReasons:true,canDeleteRecords:false,canExportReports:false,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 USER:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageAssignments:false,canManageSettings:false,canViewUsers:false,canViewAreaPresets:false,canManageAreaPresets:false,canViewReasonPresets:false,canManageReasonPresets:false,canViewShiftSchedule:false,canManageShiftSchedule:false,canViewDailyTasks:false,canManageDailyTasks:false,canAddDowntimeReasons:false,canDeleteRecords:false,canExportReports:false,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 SPECTATOR:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageAssignments:false,canManageSettings:false,canViewUsers:false,canViewAreaPresets:false,canManageAreaPresets:false,canViewReasonPresets:false,canManageReasonPresets:false,canViewShiftSchedule:false,canManageShiftSchedule:false,canViewDailyTasks:false,canManageDailyTasks:false,canAddDowntimeReasons:false,canDeleteRecords:false,canExportReports:false,canViewPlantOverview:false,canViewStaff:false,canViewAssignments:false,canViewDashboards:false,canViewReports:false}
};
const cryptoHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const digest=async(s:string)=>cryptoHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
async function hashPin(pin:string,salt:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);return cryptoHex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:150000,hash:"SHA-256"},key,256)))}
async function verifyPin(pin:string,user:any){return user?.pinSalt&&user?.pinHash&&await hashPin(pin,user.pinSalt)===user.pinHash}
function safeUser(u:any){return {username:u.username,tier:u.tier,enabled:u.enabled!==false,displayName:u.displayName||u.username}}
const lockedRolePrivileges:Record<string,Record<string,boolean>>={
 OWNER:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageAssignments:true,canManageSettings:true,canViewUsers:true,canViewAreaPresets:true,canManageAreaPresets:true,canViewReasonPresets:true,canManageReasonPresets:true,canViewShiftSchedule:true,canManageShiftSchedule:true,canViewDailyTasks:true,canManageDailyTasks:true,canAddDowntimeReasons:true,canDeleteRecords:true,canExportReports:true,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 DEVACC:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageAssignments:true,canManageSettings:true,canViewUsers:true,canViewAreaPresets:true,canManageAreaPresets:true,canViewReasonPresets:true,canManageReasonPresets:true,canViewShiftSchedule:true,canManageShiftSchedule:true,canViewDailyTasks:true,canManageDailyTasks:true,canAddDowntimeReasons:true,canDeleteRecords:true,canExportReports:true,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
};
function addStableRecordIds(weeks:any){
 const copy=structuredClone(weeks||{});
 for(const [weekKey,week] of Object.entries(copy) as [string,any][]){
  const days=Array.isArray(week?.days)?week.days:[];
  days.forEach((day:any,dayIndex:number)=>{
   if(!Array.isArray(day?.entries))return;
   day.entries=day.entries.map((entry:any,entryIndex:number)=>{
    if(!entry||typeof entry!=="object"||Array.isArray(entry))return entry;
    const recordId=typeof entry.recordId==="string"&&entry.recordId?entry.recordId:`legacy-${weekKey}-${dayIndex}-${entryIndex}`;
    return {...entry,recordId};
   });
  });
 }
 return copy;
}
function normalizeBank(p:any){
 const b=p||{};
 b.appData=b.appData||{};
 b.users=Array.isArray(b.users)?b.users:[];
 const storedTiers=b.tiers&&typeof b.tiers==="object"?b.tiers:{};
 b.tiers=Object.fromEntries(tiers.map(tier=>[tier,{...tierDefault[tier],...(storedTiers[tier]||{})}]));
 for(const [tier,permissions] of Object.entries(lockedRolePrivileges))Object.assign(b.tiers[tier],permissions);
 b.staff=b.staff||{roster:[],profiles:{}};
 b.statsSource=b.statsSource||{weeks:b.appData.weeks||{}};
 return b;
}
const centralConfigDays=["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"];
function configString(value:any,label:string,max=120){
 const result=String(value??"").trim();
 if(result.length>max)throw new Error(label+" must be "+max+" characters or fewer");
 return result;
}
function configStringList(value:any,label:string,maxItems=250,maxLength=100){
 if(!Array.isArray(value))throw new Error(label+" must be a list");
 const result:string[]=[],seen=new Set<string>();
 for(const raw of value){
  if(typeof raw!=="string")throw new Error(label+" entries must be text");
  const item=raw.trim();if(!item)continue;
  if(item.length>maxLength)throw new Error(label+" entries must be "+maxLength+" characters or fewer");
  const key=item.toLocaleLowerCase();if(seen.has(key))throw new Error(label+" contains a duplicate entry: "+item);
  seen.add(key);result.push(item);if(result.length>maxItems)throw new Error(label+" cannot contain more than "+maxItems+" entries");
 }
 return result;
}
function normalizeCentralConfig(input:any){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Configuration object required");
 if(JSON.stringify(input).length>250000)throw new Error("Configuration is too large");
 if(Number(input.schemaVersion)!==1)throw new Error("Unsupported configuration schema version");
 const organization=input.organization||{},structure=input.structure||{},libraries=input.libraries||{},defaults=input.defaults||{};
 const companyName=configString(organization.companyName,"Company name",120);
 const siteCode=configString(organization.siteCode,"Site code",32);
 const timezone=configString(organization.timezone||"Europe/London","Timezone",64);
 const locale=configString(organization.locale||"en-GB","Locale",20);
 try{new Intl.DateTimeFormat("en-GB",{timeZone:timezone}).format(new Date())}catch{throw new Error("Timezone must be a valid IANA timezone")}
 const shiftSchedule=defaults.shiftSchedule&&typeof defaults.shiftSchedule==="object"&&!Array.isArray(defaults.shiftSchedule)?structuredClone(defaults.shiftSchedule):{};
 if(JSON.stringify(shiftSchedule).length>60000)throw new Error("Shift schedule is too large");
 const shiftPresets=Array.isArray(defaults.shiftPresets)?defaults.shiftPresets.slice(0,50).map((preset:any)=>{
  if(!preset||typeof preset!=="object"||Array.isArray(preset)||!preset.config||typeof preset.config!=="object"||Array.isArray(preset.config))throw new Error("Shift presets must contain a name and configuration");
  return {name:configString(preset.name,"Shift preset name",60),config:preset.config};
 }).filter((preset:any)=>preset.name):[];
 const weekStartsOn=String(defaults.weekStartsOn||"MONDAY").toUpperCase();
 if(!centralConfigDays.includes(weekStartsOn))throw new Error("Week start must be a valid day");
 const operatingDays=configStringList(defaults.operatingDays||centralConfigDays.slice(0,6),"Operating days",7,12).map((day:string)=>day.toUpperCase());
 if(operatingDays.some(day=>!centralConfigDays.includes(day)))throw new Error("Operating days contain an invalid day");
 const breakDeductionMinutes=Number(defaults.breakDeductionMinutes);
 if(!Number.isInteger(breakDeductionMinutes)||breakDeductionMinutes<0||breakDeductionMinutes>240)throw new Error("Break deduction must be between 0 and 240 minutes");
 return {
  schemaVersion:1,
  organization:{companyName,siteCode,timezone,locale},
  structure:{sites:configStringList(structure.sites||[],"Sites"),plants:configStringList(structure.plants||[],"Plants"),areas:configStringList(structure.areas||[],"Plant areas"),stations:configStringList(structure.stations||[],"Stations")},
  libraries:{areaPresets:configStringList(libraries.areaPresets||[],"Area presets"),downtimeReasons:configStringList(libraries.downtimeReasons||[],"Downtime reasons"),dailyTaskPresets:configStringList(libraries.dailyTaskPresets||[],"Daily task presets",250,120),equipmentCategories:configStringList(libraries.equipmentCategories||[],"Equipment categories"),eventCategories:configStringList(libraries.eventCategories||[],"Event categories"),statusCategories:configStringList(libraries.statusCategories||[],"Status categories")},
  defaults:{shiftSchedule,shiftPresets,weekStartsOn,operatingDays,breakDeductionMinutes}
 };
}

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
   const {data:setupCode,error:setupCodeError}=await db.rpc("downtime_get_bootstrap_code");if(setupCodeError||typeof setupCode!=="string"||!setupCode)return json({error:"Bootstrap code is not configured in Supabase Vault"},503);if(typeof body.bootstrapCode!=="string"||body.bootstrapCode!==setupCode)return json({error:"Bootstrap code invalid"},401);
   if(bank.users.length>0)return json({error:"Bootstrap already completed"},409);
   const suppliedUsername=String(body.username||"").trim(),username="DEV",pin=String(body.pin||"");
   if(suppliedUsername.toUpperCase()!=="DEV"||!/^[0-9]{4,8}$/.test(pin))return json({error:"The root OWNER username is fixed as DEV; PIN must be 4-8 digits"},400);
   const salt=cryptoHex(crypto.getRandomValues(new Uint8Array(16)));
   bank.users=[{username,displayName:username,tier:"OWNER",enabled:true,pinSalt:salt,pinHash:await hashPin(pin,salt)}];
   const {data:bootWrite,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",row?.version||0).select("id").maybeSingle();
   if(error||!bootWrite)return json({error:"Bootstrap conflict; refresh and retry"},409);
   await db.from("downtime_central_audit").insert({username,action:"bootstrap",details:{}});
   return json({ok:true,message:"Owner account initialized. Sign in."});
 }
 if(action==="list-users"){return json({users:bank.users.filter((u:any)=>u.enabled!==false).map((u:any)=>({username:u.username,displayName:u.displayName||u.username,tier:u.tier}))});}
 if(action==="login"){
   const username=String(body.username||"").trim(),pin=String(body.pin||""),rateKey=username.toLowerCase();
   if(pin.length>8||!username||!/^[0-9]{4,8}$/.test(pin))return json({error:"Invalid credentials"},401);
   const cutoff=new Date(Date.now()-5*60*1000).toISOString();
   const {count:failedCount,error:rateError}=await db.from("downtime_central_audit").select("id",{count:"exact",head:true}).eq("username",rateKey).eq("action","login-failed").gte("created_at",cutoff);
   if(rateError)return json({error:"Login service temporarily unavailable"},503);
   if((failedCount||0)>=5)return json({error:"Too many failed attempts. Try again in five minutes."},429);
   const user=bank.users.find((u:any)=>u.username.toLowerCase()===rateKey&&u.enabled!==false);
   if(!user||!await verifyPin(pin,user)){await db.from("downtime_central_audit").insert({username:rateKey,action:"login-failed",details:{}});return json({error:"Invalid username or PIN"},401);}
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
 const tier=currentUser.tier,storedPrivileges=bank.tiers[tier]||{},priv={...tierDefault[tier],...storedPrivileges};
 if(lockedRolePrivileges[tier])Object.assign(priv,lockedRolePrivileges[tier]);
 const currentUsername=String(currentUser.username||"").trim().toUpperCase();
 const isDevRoot=currentUsername==="DEV"&&tier==="OWNER";
 const isDevacc=tier==="DEVACC";
 const isRootAuthority=isDevRoot||isDevacc;
 const isCentralAdmin=tier==="ADMIN"||isRootAuthority;
 const isCentralBankAccess=isRootAuthority;
 if(action==="central-admin-state"){
   if(!isCentralBankAccess)return json({error:"Central Data Bank access is restricted to DEV and DEVACC only."},403);
   return json({payload:{...bank,users:bank.users.map(safeUser)},version:row?.version||0,updatedAt:row?.updated_at||null,user:safeUser(currentUser)});
 }
  if(typeof action==="string"&&action.startsWith("central-config-")&&!isCentralBankAccess)return json({error:"Central Data Bank access is restricted to DEV and DEVACC only."},403);
  if(action==="central-config-state"){
    const {data:configState,error:configError}=await db.from("downtime_central_config_state").select("*").eq("id",1).maybeSingle();
    if(configError||!configState)return json({error:"Configuration control plane is not installed. Apply the Central Data Bank configuration migration first."},503);
    const {data:history,error:historyError}=await db.from("downtime_central_config_history").select("version,parent_version,action,actor,note,created_at,published_at").order("version",{ascending:false}).limit(40);
    if(historyError)return json({error:"Configuration history unavailable"},503);
    const versions=(history||[]).map((item:any)=>({...item,status:Number(item.version)===Number(configState.published_version)?"PUBLISHED":Number(item.version)===Number(configState.draft_version)?"CURRENT DRAFT":"HISTORICAL"}));
    return json({draft:configState.draft_payload,published:configState.published_payload,draftVersion:Number(configState.draft_version),publishedVersion:Number(configState.published_version),nextVersion:Number(configState.next_version),updatedBy:configState.updated_by,updatedAt:configState.updated_at,publishedBy:configState.published_by,publishedAt:configState.published_at,versions,user:safeUser(currentUser)});
  }
  if(action==="central-config-save-draft"){
    const {data:configState,error:configError}=await db.from("downtime_central_config_state").select("*").eq("id",1).maybeSingle();
    if(configError||!configState)return json({error:"Configuration control plane is not installed"},503);
    if(Number(body.draftVersion)!==Number(configState.draft_version)||Number(body.nextVersion)!==Number(configState.next_version))return json({error:"Draft changed in another session. Refresh before saving."},409);
    let config:any;try{config=normalizeCentralConfig(body.config)}catch(error){return json({error:error instanceof Error?error.message:"Invalid configuration"},400)}
    const newVersion=Number(configState.next_version);let note="Draft configuration saved";try{note=configString(body.note||note,"Change note",240)}catch(error){return json({error:error instanceof Error?error.message:"Invalid change note"},400)}
    const {error:historyInsertError}=await db.from("downtime_central_config_history").insert({version:newVersion,payload:config,parent_version:configState.draft_version,action:"draft-save",actor:currentUser.username,note});
    if(historyInsertError)return json({error:"Unable to create configuration version"},409);
    const {data:write,error}=await db.from("downtime_central_config_state").update({draft_payload:config,draft_version:newVersion,next_version:newVersion+1,updated_by:currentUser.username,updated_at:new Date().toISOString()}).eq("id",1).eq("draft_version",Number(body.draftVersion)).eq("next_version",Number(body.nextVersion)).select("id").maybeSingle();
    if(error||!write){await db.from("downtime_central_config_history").delete().eq("version",newVersion);return json({error:"Draft changed in another session. Refresh before saving."},409)}
    await db.from("downtime_central_audit").insert({username:currentUser.username,action:"central-config-draft-save",details:{version:newVersion}});
    return json({ok:true,draftVersion:newVersion,nextVersion:newVersion+1,updatedAt:new Date().toISOString()});
  }
  if(action==="central-config-publish"){
    const {data:configState,error:configError}=await db.from("downtime_central_config_state").select("*").eq("id",1).maybeSingle();
    if(configError||!configState)return json({error:"Configuration control plane is not installed"},503);
    if(Number(body.draftVersion)!==Number(configState.draft_version)||Number(body.publishedVersion)!==Number(configState.published_version))return json({error:"Configuration changed in another session. Refresh before publishing."},409);
    if(Number(configState.draft_version)===Number(configState.published_version))return json({error:"There are no unpublished changes to activate."},409);
    try{normalizeCentralConfig(configState.draft_payload)}catch(error){return json({error:error instanceof Error?error.message:"Draft validation failed"},400)}
    const now=new Date().toISOString();
    const {data:write,error}=await db.from("downtime_central_config_state").update({published_payload:configState.draft_payload,published_version:configState.draft_version,published_by:currentUser.username,published_at:now}).eq("id",1).eq("draft_version",Number(body.draftVersion)).eq("published_version",Number(body.publishedVersion)).select("id").maybeSingle();
    if(error||!write)return json({error:"Configuration changed in another session. Refresh before publishing."},409);
    await db.from("downtime_central_config_history").update({published_at:now}).eq("version",Number(configState.draft_version));
    await db.from("downtime_central_audit").insert({username:currentUser.username,action:"central-config-publish",details:{version:Number(configState.draft_version)}});
    return json({ok:true,publishedVersion:Number(configState.draft_version),publishedAt:now});
  }
  if(action==="central-config-restore-draft"){
    const {data:configState,error:configError}=await db.from("downtime_central_config_state").select("*").eq("id",1).maybeSingle();
    if(configError||!configState)return json({error:"Configuration control plane is not installed"},503);
    if(Number(body.draftVersion)!==Number(configState.draft_version)||Number(body.nextVersion)!==Number(configState.next_version))return json({error:"Draft changed in another session. Refresh before restoring."},409);
    const sourceVersion=Number(body.sourceVersion);
    if(!Number.isSafeInteger(sourceVersion)||sourceVersion<1)return json({error:"Select a valid historical version"},400);
    const {data:source,error:sourceError}=await db.from("downtime_central_config_history").select("payload").eq("version",sourceVersion).maybeSingle();
    if(sourceError||!source)return json({error:"Historical configuration version not found"},404);
    let config:any;try{config=normalizeCentralConfig(source.payload)}catch(error){return json({error:error instanceof Error?error.message:"Historical configuration is invalid"},400)}
    const newVersion=Number(configState.next_version),note="Restored historical version v"+sourceVersion+" as a new draft";
    const {error:historyInsertError}=await db.from("downtime_central_config_history").insert({version:newVersion,payload:config,parent_version:sourceVersion,action:"restore-draft",actor:currentUser.username,note});
    if(historyInsertError)return json({error:"Unable to create restored draft"},409);
    const {data:write,error}=await db.from("downtime_central_config_state").update({draft_payload:config,draft_version:newVersion,next_version:newVersion+1,updated_by:currentUser.username,updated_at:new Date().toISOString()}).eq("id",1).eq("draft_version",Number(body.draftVersion)).eq("next_version",Number(body.nextVersion)).select("id").maybeSingle();
    if(error||!write){await db.from("downtime_central_config_history").delete().eq("version",newVersion);return json({error:"Draft changed in another session. Refresh before restoring."},409)}
    await db.from("downtime_central_audit").insert({username:currentUser.username,action:"central-config-restore-draft",details:{sourceVersion,newVersion}});
    return json({ok:true,draftVersion:newVersion,nextVersion:newVersion+1,sourceVersion});
  }
  if(action==="get-state"){const publicBank={...bank,users:priv.canManageUsers||priv.canViewUsers?bank.users.map(safeUser):[safeUser(currentUser)]};const restrictedData={...(publicBank.appData||{})};if(!priv.canDeleteRecords&&priv.canViewDashboards)restrictedData.weeks=addStableRecordIds(restrictedData.weeks||{});if(!priv.canViewStaff&&!priv.canManageStaff&&!priv.canManageAssignments){publicBank.staff={roster:[],profiles:{}};delete restrictedData.staffRoster;delete restrictedData.operatorProfiles;}else if(!priv.canViewStaff&&!priv.canManageStaff&&priv.canManageAssignments){const assignmentProfiles=publicBank.staff?.profiles||{};const minimalProfiles=Object.fromEntries(Object.entries(assignmentProfiles).map(([name,profile]:any)=>[name,{name,onSite:profile?.onSite!==false,station:String(profile?.station||profile?.assignedStation||"").slice(0,100)}]));publicBank.staff={roster:publicBank.staff?.roster||[],profiles:minimalProfiles};restrictedData.staffRoster=publicBank.staff.roster;restrictedData.operatorProfiles=minimalProfiles;}if(!priv.canViewAssignments&&!priv.canManageAssignments){delete restrictedData.assignments;if(restrictedData.weeks){for(const weekData of Object.values(restrictedData.weeks) as any[]){for(const dayData of (weekData?.days||[])){delete dayData.operator;}}}if(priv.canViewStaff||priv.canManageStaff){const hideAssignments=(profiles:any)=>Object.fromEntries(Object.entries(profiles||{}).map(([name,profile]:any)=>{const clean={...profile};delete clean.station;delete clean.assignedStation;return [name,clean]}));publicBank.staff={...publicBank.staff,profiles:hideAssignments(publicBank.staff?.profiles)};restrictedData.operatorProfiles=hideAssignments(restrictedData.operatorProfiles);}}if(!priv.canViewDashboards){delete restrictedData.weeks;delete restrictedData.quickReasons;delete restrictedData.archive;}if(!(priv.canViewAreaPresets||priv.canManageAreaPresets||priv.canManageSettings))delete restrictedData.areas;if(!(priv.canViewReasonPresets||priv.canManageReasonPresets||priv.canAddDowntimeReasons||priv.canManageSettings))delete restrictedData.reasons;if(!(priv.canViewShiftSchedule||priv.canManageShiftSchedule||priv.canManageSettings)){delete restrictedData.shiftSchedule;delete restrictedData.shiftPresets;}if(!(priv.canViewDailyTasks||priv.canManageDailyTasks||priv.canManageSettings))delete restrictedData.dailyTaskPresets;if(!(priv.canViewAssignments||priv.canManageAssignments||priv.canManageSettings))delete restrictedData.stationConfig;if(!priv.canViewReports)delete restrictedData.archive;publicBank.appData=restrictedData;publicBank.statsSource={weeks:priv.canViewDashboards?(restrictedData.weeks||{}):{}};return json({payload:publicBank,user:safeUser(currentUser),version:row?.version||0,updatedAt:row?.updated_at});}
 if(action==="save-state"){
   if(!priv.canEditTracker)return json({error:"Permission denied"},403);
   const incoming=body?.appData;if(!incoming||typeof incoming!=="object"||Array.isArray(incoming))return json({error:"appData required"},400);
   const nextAppData={...incoming};
   if(Object.prototype.hasOwnProperty.call(bank.appData||{},"stationConfig"))nextAppData.stationConfig=bank.appData.stationConfig;else delete nextAppData.stationConfig;
   if(!priv.canDeleteRecords){
     const oldWeeks=bank.appData?.weeks||{},newWeeks=incoming.weeks||{};
     for(const [weekKey,oldWeek] of Object.entries(oldWeeks) as [string,any][]){
       const newWeek=(newWeeks as any)[weekKey];
       const oldDays=Array.isArray(oldWeek?.days)?oldWeek.days:[];
       const newDays=Array.isArray(newWeek?.days)?newWeek.days:[];
       for(let dayIndex=0;dayIndex<oldDays.length;dayIndex++){
         const oldEntries=Array.isArray(oldDays[dayIndex]?.entries)?oldDays[dayIndex].entries:[];
         const newEntries=Array.isArray(newDays[dayIndex]?.entries)?newDays[dayIndex].entries:[];
         for(let entryIndex=0;entryIndex<oldEntries.length;entryIndex++){
           const entry=oldEntries[entryIndex]||{},recordId=typeof entry.recordId==="string"&&entry.recordId?entry.recordId:`legacy-${weekKey}-${dayIndex}-${entryIndex}`;
           if(!newEntries.some((candidate:any)=>candidate?.recordId===recordId))return json({error:"This tier cannot delete operational records. Refresh and retain the original record."},403);
         }
       }
     }
     const oldArchive=Array.isArray(bank.appData?.archive)?bank.appData.archive:[];
     const newArchive=Array.isArray(incoming.archive)?incoming.archive:[];
     if(newArchive.length<oldArchive.length)return json({error:"This tier cannot delete archived records."},403);
   }
   if(!priv.canManageSettings){
     if("areas" in (bank.appData||{}))nextAppData.areas=bank.appData.areas;
     if(Array.isArray(bank.appData?.dailyTaskPresets))nextAppData.dailyTaskPresets=bank.appData.dailyTaskPresets;else delete nextAppData.dailyTaskPresets;
     if("shiftSchedule" in (bank.appData||{}))nextAppData.shiftSchedule=bank.appData.shiftSchedule;else delete nextAppData.shiftSchedule;
     if("shiftPresets" in (bank.appData||{}))nextAppData.shiftPresets=bank.appData.shiftPresets;else delete nextAppData.shiftPresets;
     delete nextAppData.quickReasons;delete nextAppData.recentReasons;
     for(const field of ["reasons"]){
       if(!priv.canAddDowntimeReasons){if(field in (bank.appData||{}))nextAppData[field]=bank.appData[field];continue;}
       const existing=Array.isArray(bank.appData?.[field])?bank.appData[field]:[];
       const incomingValues=Array.isArray(incoming[field])?incoming[field]:existing;
       const additions=incomingValues.filter((value:any)=>typeof value==="string"&&value.trim()&&!existing.some((old:any)=>String(old).trim().toLowerCase()===value.trim().toLowerCase()));
       nextAppData[field]=[...existing,...additions].slice(0,250);
     }
   }
   {
     const currentProfiles=bank.staff?.profiles||bank.appData?.operatorProfiles||{};
     const incomingProfiles=structuredClone(nextAppData.operatorProfiles||{});
     const savedProfiles=priv.canManageStaff?incomingProfiles:structuredClone(currentProfiles||{});
     for(const [name,incomingProfile] of Object.entries(incomingProfiles) as [string,any][]){
       if(!Object.prototype.hasOwnProperty.call(currentProfiles,name)||!incomingProfile||typeof incomingProfile!=="object"||Array.isArray(incomingProfile))continue;
       const existing={...(currentProfiles as any)[name]};
       const merged=priv.canManageStaff?{...incomingProfile}:{...existing};
       // Assignment metadata and its lock can only be changed by the Staff Settings save-settings route.
       if(existing.stationLocked===true||!priv.canManageAssignments){
         if("station" in existing)merged.station=existing.station;else delete merged.station;
         if("assignedStation" in existing)merged.assignedStation=existing.assignedStation;else delete merged.assignedStation;
       }
       if("stationLocked" in existing)merged.stationLocked=existing.stationLocked===true;else delete merged.stationLocked;
       savedProfiles[name]=merged;
     }
     nextAppData.operatorProfiles=savedProfiles;
     if(priv.canManageStaff){
       bank.staff.profiles=savedProfiles;
       bank.staff.roster=Array.isArray(nextAppData.staffRoster)?nextAppData.staffRoster:(bank.staff.roster||[]);
     }else{
       nextAppData.staffRoster=bank.staff.roster||bank.appData?.staffRoster||[];
       bank.staff.profiles=savedProfiles;
     }
   }
   if(!priv.canViewReports||!priv.canDeleteRecords)nextAppData.archive=bank.appData?.archive||[];
   bank.appData=nextAppData;bank.statsSource={weeks:nextAppData.weeks||{}};
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict; refresh before saving"},409);
   return json({version:(row?.version||0)+1,updatedAt:new Date().toISOString()});
 }
 if(action==="save-settings"){
   const incoming=body?.appData;if(!incoming||typeof incoming!=="object"||Array.isArray(incoming))return json({error:"appData required"},400);
   const canManageAreas=priv.canManageSettings||priv.canManageAreaPresets;
   const canManageReasons=priv.canManageSettings||priv.canManageReasonPresets;
   const canManageSchedule=priv.canManageSettings||priv.canManageShiftSchedule;
   const canManageTasks=priv.canManageSettings||priv.canManageDailyTasks;
   const canManageStaff=!!priv.canManageStaff,canManageAssignments=!!priv.canManageAssignments,canManageStations=!!priv.canManageSettings;
   const canAddReasons=canManageReasons||!!priv.canAddDowntimeReasons;
   if(!(canManageAreas||canAddReasons||canManageSchedule||canManageTasks||canManageStaff||canManageAssignments||canManageStations))return json({error:"Permission denied"},403);
   const nextAppData={...(bank.appData||{})};
   const cleanList=(value:any,maxItems:number,maxLength:number)=>Array.isArray(value)?value.filter((item:any)=>typeof item==="string"&&item.trim()).slice(0,maxItems).map((item:string)=>item.trim().slice(0,maxLength)):[];
   if(canManageAreas){
     if(!Array.isArray(incoming.areas))return json({error:"Area presets must be an array"},400);
     nextAppData.areas=cleanList(incoming.areas,250,60);
   }
   if(canManageStations&&Object.prototype.hasOwnProperty.call(incoming,"stationConfig")){
     const rawStations=incoming.stationConfig;
     if(!Array.isArray(rawStations)||rawStations.length<1||rawStations.length>100)return json({error:"Station configuration must contain between 1 and 100 stations"},400);
     const stations=rawStations.map((station:any)=>({id:String(station?.id||"").trim().slice(0,80),name:String(station?.name||"").trim().slice(0,40),category:String(station?.category||"GENERAL").trim().toUpperCase().slice(0,24),active:station?.active!==false,aliases:Array.isArray(station?.aliases)?station.aliases.filter((value:any)=>typeof value==="string"&&value.trim()).slice(0,20).map((value:string)=>value.trim().slice(0,80)):[]}));
     const ids=stations.map((station:any)=>station.id),names=stations.map((station:any)=>station.name.toLowerCase());
     if(stations.some((station:any)=>!station.id||!station.name||!station.category)||new Set(ids).size!==ids.length||new Set(names).size!==names.length||!stations.some((station:any)=>station.active))return json({error:"Stations need unique IDs and names, and at least one must remain active"},400);
     nextAppData.stationConfig=stations;
   }
   if(canManageReasons){
     if(!Array.isArray(incoming.reasons))return json({error:"Reason presets must be an array"},400);
     nextAppData.reasons=cleanList(incoming.reasons,250,60);
   }else if(canAddReasons){
     const existing=cleanList(bank.appData?.reasons||[],250,60),incomingReasons=cleanList(incoming.reasons||existing,250,60);
     const additions=incomingReasons.filter((value:string)=>!existing.some((old:string)=>old.toLowerCase()===value.toLowerCase()));
     nextAppData.reasons=[...existing,...additions].slice(0,250);
   }
   if(canManageSchedule){
     if(!incoming.shiftSchedule||typeof incoming.shiftSchedule!=="object"||Array.isArray(incoming.shiftSchedule))return json({error:"Shift schedule must be an object"},400);
     nextAppData.shiftSchedule=incoming.shiftSchedule;
     nextAppData.shiftPresets=Array.isArray(incoming.shiftPresets)?incoming.shiftPresets.filter((p:any)=>p&&typeof p==="object"&&!Array.isArray(p)&&typeof p.name==="string"&&p.config&&typeof p.config==="object").slice(0,50):[];
   }
   if(canManageTasks){
     if(!Array.isArray(incoming.dailyTaskPresets))return json({error:"Daily task presets must be an array"},400);
     nextAppData.dailyTaskPresets=cleanList(incoming.dailyTaskPresets,250,100);
     const allowedTasks=new Set(nextAppData.dailyTaskPresets.map((task:string)=>task.toLowerCase()));
     const weeks=structuredClone(bank.appData?.weeks||{});
     for(const week of Object.values(weeks) as any[]){for(const day of (week?.days||[])){if(Array.isArray(day.dailyTasksDone))day.dailyTasksDone=day.dailyTasksDone.filter((task:any)=>typeof task==='string'&&allowedTasks.has(task.toLowerCase()));}}
     nextAppData.weeks=weeks;
   }
   bank.staff=bank.staff||{roster:[],profiles:{}};
   const currentProfiles=bank.staff.profiles||bank.appData?.operatorProfiles||{};
   if(canManageStaff){
     if(incoming.operatorProfiles&&typeof incoming.operatorProfiles!=="object"||Array.isArray(incoming.operatorProfiles))return json({error:"Invalid staff profiles"},400);
     if(!Array.isArray(incoming.staffRoster))return json({error:"Invalid staff roster"},400);
     const newProfiles=structuredClone(incoming.operatorProfiles||currentProfiles);
     for(const [name,profile] of Object.entries(newProfiles) as [string,any][]){
       const existing=(currentProfiles as any)[name]||{};
       if(!canManageAssignments){
         if("station" in existing)profile.station=existing.station;else delete profile.station;
         if("assignedStation" in existing)profile.assignedStation=existing.assignedStation;else delete profile.assignedStation;
         if("stationLocked" in existing)profile.stationLocked=existing.stationLocked;else delete profile.stationLocked;
         continue;
       }
       const wasLocked=existing.stationLocked===true;
       const explicitlyUnlocked=profile.stationLocked===false;
       const requestedStation=String(profile.station??profile.assignedStation??"").slice(0,100);
       const currentStation=String(existing.station??existing.assignedStation??"");
       if(wasLocked&&!explicitlyUnlocked&&requestedStation!==currentStation){
         if("station" in existing)profile.station=existing.station;else delete profile.station;
         if("assignedStation" in existing)profile.assignedStation=existing.assignedStation;else delete profile.assignedStation;
         profile.stationLocked=true;
       }else if(wasLocked&&!explicitlyUnlocked){
         profile.stationLocked=true;
       }else if("stationLocked" in profile){
         profile.stationLocked=profile.stationLocked===true;
       }
     }
     nextAppData.operatorProfiles=newProfiles;
     nextAppData.staffRoster=cleanList(incoming.staffRoster,250,80);
     bank.staff.profiles=newProfiles;bank.staff.roster=nextAppData.staffRoster.slice();
   }else if(canManageAssignments){
     const newProfiles=structuredClone(currentProfiles||{});
     for(const [name,profile] of Object.entries((incoming.operatorProfiles||{}) as Record<string,any>)){
       if(!Object.prototype.hasOwnProperty.call(newProfiles,name)||!profile||typeof profile!=="object"||Array.isArray(profile))continue;
       const existing={...(newProfiles as any)[name]};
       const wasLocked=existing.stationLocked===true,hasLockValue="stationLocked" in profile,willBeLocked=hasLockValue?profile.stationLocked===true:wasLocked;
       const requestedStation=String(profile.station??profile.assignedStation??"").slice(0,100);
       const currentStation=String(existing.station??existing.assignedStation??"");
       // Reassigning a locked member requires an explicit unlock in this Staff Settings transaction.
       if(!wasLocked||(hasLockValue&&profile.stationLocked===false)||requestedStation===currentStation){
         if("station" in profile)existing.station=requestedStation;
         else if("assignedStation" in profile)existing.assignedStation=requestedStation;
       }
       if(hasLockValue)existing.stationLocked=willBeLocked;else if(wasLocked)existing.stationLocked=true;
       (newProfiles as any)[name]=existing;
     }
     nextAppData.operatorProfiles=newProfiles;
     nextAppData.staffRoster=bank.staff.roster||bank.appData?.staffRoster||[];
     bank.staff.profiles=newProfiles;
   }
   bank.appData=nextAppData;if(canManageTasks)bank.statsSource={weeks:nextAppData.weeks||{}};
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict; refresh before saving settings"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"save-settings",details:{areas:canManageAreas,reasons:canAddReasons,schedule:canManageSchedule,dailyTasks:canManageTasks,staff:canManageStaff,assignments:canManageAssignments,stations:canManageStations}});
   return json({ok:true,version:(row?.version||0)+1,updatedAt:new Date().toISOString()});
 }
 if(action==="users"){
   if(!priv.canViewUsers&&!priv.canManageUsers)return json({error:"Permission denied"},403);
   return json({users:bank.users.map(safeUser),tiers:bank.tiers});
 }
 if(action==="user-save"){
   if(!priv.canManageUsers)return json({error:"Permission denied"},403);
   const username=String(body.username||"").trim(),displayName=String(body.displayName||username).trim(),newTier=String(body.tier||"USER"),pin=String(body.pin||"");
   if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)||!tiers.includes(newTier))return json({error:"Invalid user/tier"},400);
   const idx=bank.users.findIndex((u:any)=>u.username.toLowerCase()===username.toLowerCase());
   const existing=idx>=0?bank.users[idx]:null;
   const isRootName=username.toUpperCase()==="DEV";
   if((!existing||newTier!==existing.tier)&&!isCentralAdmin)return json({error:"Only ADMIN, DEV and DEVACC can create accounts or assign user tiers."},403);
   if(isRootName){
     if(!isDevRoot)return json({error:"Only root DEV can update root credentials."},403);
     if(!existing||existing.tier!=="OWNER"||newTier!=="OWNER"||body.enabled===false)return json({error:"DEV is the immutable root OWNER and cannot be created, demoted or disabled."},400);
   }else{
     if(newTier==="OWNER")return json({error:"DEV is the only OWNER account. Additional OWNER accounts are prohibited."},403);
     if(newTier==="DEVACC"&&!isDevRoot)return json({error:"Only root DEV can assign DEVacc."},403);
     if(existing?.tier==="DEVACC"&&!isCentralBankAccess)return json({error:"Only DEV and DEVACC can modify DEVacc."},403);
     if(existing?.tier==="OWNER")return json({error:"The root OWNER account is protected."},403);
   }
   let user=existing||{username};
   user.username=username;user.displayName=displayName;user.tier=newTier;user.enabled=body.enabled!==false;
   if(pin){if(!/^[0-9]{4,8}$/.test(pin))return json({error:"PIN must be 4-8 digits"},400);user.pinSalt=cryptoHex(crypto.getRandomValues(new Uint8Array(16)));user.pinHash=await hashPin(pin,user.pinSalt)}
   if(idx>=0)bank.users[idx]=user;else{if(!pin)return json({error:"PIN required for new user"},400);bank.users.push(user)}
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"user-save",details:{target:username,tier:newTier}});
   await db.from("downtime_central_sessions").delete().eq("username",existing?.username||username);
   return json({ok:true,version:(row?.version||0)+1});
 }
 if(action==="user-delete"){
   if(!priv.canManageUsers)return json({error:"Permission denied"},403);
   const target=String(body.username||"").trim();
   if(!target)return json({error:"Username required"},400);
   if(target.toUpperCase()==="DEV"||bank.users.some((u:any)=>u.username.toLowerCase()===target.toLowerCase()&&u.tier==="OWNER"))return json({error:"The DEV root OWNER account cannot be deleted or removed."},403);
   if(bank.users.some((u:any)=>u.username.toLowerCase()===target.toLowerCase()&&u.tier==="DEVACC")&&!isCentralBankAccess)return json({error:"Only DEV and DEVACC can remove DEVacc."},403);
   if(target.toLowerCase()===currentUser.username.toLowerCase())return json({error:"Cannot delete your own account"},400);
   bank.users=bank.users.filter((u:any)=>u.username!==target);
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"user-delete",details:{target}});
   await db.from("downtime_central_sessions").delete().eq("username",target);
   return json({ok:true,version:(row?.version||0)+1});
 }
 if(action==="staff-save"){
   if(!priv.canManageStaff)return json({error:"Permission denied"},403);
   const name=String(body.name||"").trim();if(!name||name.length>80)return json({error:"Staff name required"},400);
   bank.staff.profiles=bank.staff.profiles||{};bank.staff.roster=bank.staff.roster||[];
   const existingProfile=bank.staff.profiles[name]||bank.appData?.operatorProfiles?.[name]||{};
   const proposedProfile=body.profile&&typeof body.profile==="object"&&!Array.isArray(body.profile)?body.profile:{};
   const nextProfile={...existingProfile,...proposedProfile,name};
   if(!priv.canManageAssignments){
     if("station" in existingProfile)nextProfile.station=existingProfile.station;else delete nextProfile.station;
     if("assignedStation" in existingProfile)nextProfile.assignedStation=existingProfile.assignedStation;else delete nextProfile.assignedStation;
     if("stationLocked" in existingProfile)nextProfile.stationLocked=existingProfile.stationLocked;else delete nextProfile.stationLocked;
   }else{
     const wasLocked=existingProfile.stationLocked===true;
     const hasLockValue=Object.prototype.hasOwnProperty.call(proposedProfile,"stationLocked");
     const explicitlyUnlocked=hasLockValue&&proposedProfile.stationLocked===false;
     if(wasLocked&&!explicitlyUnlocked){
       if("station" in existingProfile)nextProfile.station=existingProfile.station;else delete nextProfile.station;
       if("assignedStation" in existingProfile)nextProfile.assignedStation=existingProfile.assignedStation;else delete nextProfile.assignedStation;
       nextProfile.stationLocked=true;
     }else if(hasLockValue){
       nextProfile.stationLocked=proposedProfile.stationLocked===true;
     }
   }
   bank.staff.profiles[name]=nextProfile;
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
   if(!priv.canViewStaff&&!priv.canManageStaff)return json({error:"Permission denied"},403);
   const {data,error}=await db.storage.from("downtime-staff-photos").createSignedUrl(path,120);
   if(error)return json({error:error.message},404);
   return json({url:data.signedUrl});
 }
 if(action==="staff-photo-remove"){
   if(!priv.canManageStaff)return json({error:"Permission denied"},403);
   const path=String(body.path||"").trim(),parts=path.split("/");
   if(parts.length!==2||!/^[a-z0-9_-]{1,80}$/i.test(parts[0])||!/^[0-9a-f-]{36}$/i.test(parts[1]))return json({error:"Invalid staff photo path"},400);
   const {error}=await db.storage.from("downtime-staff-photos").remove([path]);
   if(error)return json({error:error.message},500);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"staff-photo-remove",details:{path}});
   return json({ok:true});
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
   if(!isCentralBankAccess)return json({error:"Only DEV and DEVACC can change tier access and rights."},403);
   const proposed=body.tiers;if(!proposed||typeof proposed!=="object"||Array.isArray(proposed))return json({error:"Tiers required"},400);
   const permissionKeys=Object.keys(tierDefault.OWNER),nextTiers:Record<string,Record<string,boolean>>={...bank.tiers,OWNER:{...tierDefault.OWNER}};
   for(const role of tiers){
     if(role==="OWNER"||role==="DEVACC")continue;
     const supplied=proposed[role];
     if(!supplied||typeof supplied!=="object"||Array.isArray(supplied))return json({error:"Missing permission profile for "+role},400);
     if(Object.keys(supplied).some(key=>!permissionKeys.includes(key)))return json({error:"Unknown permission key for "+role},400);
     const next:Record<string,boolean>={...tierDefault[role],...(bank.tiers[role]||{})};
     for(const key of permissionKeys){
       if(typeof supplied[key]!=="boolean")return json({error:"Permission values must be boolean ("+role+"."+key+")"},400);
       next[key]=supplied[key];
     }
     nextTiers[role]=next;
   }
   bank.tiers=nextTiers;
   const {data:write,error}=await db.from("downtime_central_bank").update({payload:bank,version:(row?.version||0)+1,updated_at:new Date().toISOString()}).eq("id",1).eq("version",Number(body.version)).select("id").maybeSingle();
   if(error||!write)return json({error:"Version conflict"},409);
   await db.from("downtime_central_audit").insert({username:currentUser.username,action:"tiers-save",details:{tiers:tiers.filter(role=>role!=="OWNER"&&role!=="DEVACC")}});
   return json({ok:true,version:(row?.version||0)+1});
 }
 if(action==="logout"){await db.from("downtime_central_sessions").delete().eq("token_hash",tokenHash);return json({ok:true});}
 return json({error:"Unknown action"},400);
});
