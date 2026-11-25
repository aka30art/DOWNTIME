import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigin = "https://aka30art.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-downtime-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store", "Vary": "Origin", "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers});
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0,max);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return new Response("Forbidden",{status:403});
    return new Response("ok",{headers});
  }
  if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return json({error:"Origin denied"},403);
  if (req.method !== "POST") return json({error:"POST only"},405);
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({error:"GATELOG service configuration missing."},500);
  let body:Record<string,unknown>;try{body=await req.json()}catch{return json({error:"Invalid JSON."},400)}
  const token=req.headers.get("x-downtime-session")||"";
  if(!token)return json({error:"Sign in to YARD HUB first."},401);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:sessionError}=await db.from("downtime_central_sessions").select("username,expires_at").eq("token_hash",await digest(token)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(sessionError||!session)return json({error:"YARD HUB session expired. Sign in again."},401);
  const {data:bank,error:bankError}=await db.from("downtime_central_bank").select("payload").eq("id",1).maybeSingle();
  if(bankError||!bank?.payload)return json({error:"Central user directory unavailable."},503);
  const user=(Array.isArray(bank.payload.users)?bank.payload.users:[]).find((item:any)=>String(item.username).toLowerCase()===String(session.username).toLowerCase()&&item.enabled!==false);
  if(!user)return json({error:"Account disabled or unavailable."},401);
  const legacyTier=String(user.tier||"USER").toUpperCase();
  const canAccess=bank.payload.tiers?.[legacyTier]?.canAccessYardHub!==false||String(user.username).toUpperCase()==="DEV"&&legacyTier==="OWNER";
  if(!canAccess)return json({error:"YARD HUB access is disabled for this account."},403);
  const actor=clean(user.displayName||user.username,80), action=String(body.action||"");
  const fail=(error:any)=>json({error:error?.message||"GATELOG request failed."},400);

  if(action==="bootstrap"){
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    const [customers,vehicles,active,waste,todayVisits,customerStats,overallStats,registerRows] = await Promise.all([
      db.from("gatelog_customers").select("id,customer_name,created_at").eq("active",true).order("customer_name"),
      db.from("gatelog_vehicles").select("id,customer_id,registration").eq("active",true).order("registration"),
      db.from("gatelog_visits").select("id,customer_id,vehicle_registration_snapshot,visit_date,time_in,status").is("time_out",null).order("time_in",{ascending:false}),
      db.from("gatelog_waste_types").select("id,label").order("label"),
      db.from("gatelog_visits").select("id,status").eq("visit_date",today),
      db.rpc("gatelog_customer_visit_stats"),
      db.rpc("gatelog_overall_statistics"),
      db.from("gatelog_visits").select("id,customer_id,vehicle_registration_snapshot,visit_date,time_in,time_out,status,gatelog_customers(customer_name),gatelog_visit_waste_types(gatelog_waste_types(label))").order("time_in",{ascending:false}).limit(100)
    ]);
    const error=[customers,vehicles,active,waste,todayVisits,customerStats,overallStats,registerRows].find(x=>x.error)?.error;if(error)return json({error:"GATELOG data could not be loaded."},503);
    const customerIds=(customers.data||[]).map((x:any)=>x.id);
    const visits=active.data||[];
    const ids=visits.map((x:any)=>x.id);
    const [visitWaste,customerRows]=await Promise.all([
      ids.length?db.from("gatelog_visit_waste_types").select("visit_id,gatelog_waste_types(label)").in("visit_id",ids):Promise.resolve({data:[],error:null}),
      customerIds.length?db.from("gatelog_customers").select("id,customer_name").in("id",customerIds):Promise.resolve({data:[],error:null})
    ]);
    if(visitWaste.error||customerRows.error)return json({error:"GATELOG relationships could not be loaded."},503);
    return json({customers:customers.data||[],vehicles:vehicles.data||[],customerStats:Object.fromEntries((customerStats.data||[]).map((row:any)=>[row.customer_id,{totalVisits:Number(row.total_visits)||0,todayVisits:Number(row.today_visits)||0}])),arrivalsToday:(todayVisits.data||[]).length,departuresToday:(todayVisits.data||[]).filter((v:any)=>v.status==="DEPARTED").length,activeVisits:visits.map((v:any)=>({...v,customer_name:(customerRows.data||[]).find((c:any)=>c.id===v.customer_id)?.customer_name||"Unknown",waste_types:(visitWaste.data||[]).filter((w:any)=>w.visit_id===v.id).map((w:any)=>w.gatelog_waste_types?.label).filter(Boolean)})),wasteTypes:waste.data||[],statistics:{overallVisits:Number(overallStats.data?.[0]?.total_visits)||0,mostCommonWasteType:overallStats.data?.[0]?.most_common_waste_type||"—",averageMinutes:overallStats.data?.[0]?.average_minutes==null?null:Number(overallStats.data[0].average_minutes),completedVisits:Number(overallStats.data?.[0]?.completed_visits)||0},register:(registerRows.data||[]).map((v:any)=>({...v,customer_name:v.gatelog_customers?.customer_name||"Unknown",waste_types:(v.gatelog_visit_waste_types||[]).map((x:any)=>x.gatelog_waste_types?.label).filter(Boolean)}))});
  }
  if(action==="customer-arrival"){
    const name=clean(body.customerName,120),registration=clean(body.registration,20).toUpperCase();
    const wasteTypes=Array.isArray(body.wasteTypes)?[...new Set(body.wasteTypes.map((x:any)=>clean(x,80)).filter(Boolean))].slice(0,12):[];
    if(!name||!registration||!wasteTypes.length)return json({error:"Enter a customer/company name, vehicle registration and at least one waste type."},400);
    const {data,error}=await db.rpc("gatelog_create_customer_arrival",{p_customer_name:name,p_registration:registration,p_waste_types:wasteTypes,p_actor:actor});
    if(error)return fail(error);
    const result=Array.isArray(data)?data[0]:data;
    return json({customer:{id:result.customer_id,customer_name:result.customer_name},visit:{id:result.visit_id}});
  }
  if(action==="customer-save"){
    const name=clean(body.customerName,120);if(!name)return json({error:"Customer/company name is required."},400);
    const existing=await db.from("gatelog_customers").select("id,customer_name").ilike("customer_name",name).eq("active",true).maybeSingle();
    if(existing.error)return fail(existing.error);
    if(existing.data)return json({customer:existing.data});
    const {data,error}=await db.from("gatelog_customers").insert({customer_name:name,active:true}).select("id,customer_name").single();
    if(error)return fail(error);
    return json({customer:data});
  }
  if(action==="vehicle-save"){
    const customerId=clean(body.customerId,60),registration=clean(body.registration,20).toUpperCase();
    if(!customerId||!registration)return json({error:"Customer and vehicle registration are required."},400);
    const {data,error}=await db.from("gatelog_vehicles").upsert({customer_id:customerId,registration,active:true},{onConflict:"customer_id,registration"}).select("id,customer_id,registration").single();
    if(error)return fail(error);return json({vehicle:data});
  }
  if(action==="arrival"){
    const customerId=clean(body.customerId,60),registration=clean(body.registration,20).toUpperCase();
    const wasteTypes=Array.isArray(body.wasteTypes)?[...new Set(body.wasteTypes.map((x:any)=>clean(x,80)).filter(Boolean))].slice(0,12):[];
    if(!customerId||!registration||!wasteTypes.length)return json({error:"Select a customer, enter a registration and choose at least one waste type."},400);
    const {data:customer,error:customerError}=await db.from("gatelog_customers").select("id").eq("id",customerId).eq("active",true).maybeSingle();
    if(customerError||!customer)return json({error:"Selected customer was not found."},404);
    const {data:visitId,error:arrivalError}=await db.rpc("gatelog_create_arrival",{p_customer_id:customerId,p_registration:registration,p_waste_types:wasteTypes,p_actor:actor});
    if(arrivalError)return fail(arrivalError);
    const {data:visit,error:visitError}=await db.from("gatelog_visits").select("id,customer_id,vehicle_registration_snapshot,visit_date,time_in,status").eq("id",visitId).single();
    if(visitError)return fail(visitError);
    return json({visit});
  }
  if(action==="departure"){
    const visitId=clean(body.visitId,60);if(!visitId)return json({error:"Visit ID is required."},400);
    const {data:rows,error}=await db.rpc("gatelog_register_departure",{p_visit_id:visitId,p_actor:actor});
    if(error)return fail(error);
    const visit=Array.isArray(rows)?rows[0]:rows;
    if(!visit)return json({error:"Visit is no longer on site. Refresh the list."},409);
    return json({visit});
  }
  if(action==="history"){
    const term=clean(body.search,100);
    let query=db.from("gatelog_visits").select("id,customer_id,vehicle_registration_snapshot,visit_date,time_in,time_out,status,created_by,departed_by,gatelog_customers(customer_name),gatelog_visit_waste_types(gatelog_waste_types(label))").order("time_in",{ascending:false}).limit(250);
    if(body.date)query=query.eq("visit_date",clean(body.date,10));
    const {data,error}=await query;if(error)return fail(error);
    const rows=(data||[]).map((v:any)=>({...v,customer_name:v.gatelog_customers?.customer_name||"Unknown",waste_types:(v.gatelog_visit_waste_types||[]).map((x:any)=>x.gatelog_waste_types?.label).filter(Boolean)}));
    return json({visits:term?rows.filter((v:any)=>[v.customer_name,v.vehicle_registration_snapshot,...v.waste_types].join(" ").toLowerCase().includes(term.toLowerCase())):rows});
  }
  return json({error:"Unknown GATELOG action."},400);
});
