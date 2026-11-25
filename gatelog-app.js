(()=> {
'use strict';
const $=id=>document.getElementById(id);
const state={customers:[],vehicles:[],active:[],wasteTypes:[],screen:null};
function ensureWorkspace(){let host=$('gatelogWorkspace');if(host)return host;const parent=document.querySelector('.yard-hub-inner');if(!parent)return null;host=document.createElement('section');host.id='gatelogWorkspace';host.hidden=true;parent.insertBefore(host,parent.querySelector('.yard-hub-footer'));return host;}
const endpoint=()=>window.GATELOG_API||'';
const session=()=>window.DowntimeCentral?.session||null;
const apiKey=()=>String(window.DOWNTIME_CENTRAL_API_KEY||'').trim();
async function call(action,payload={}) {
 const s=session();if(!s?.token)throw new Error('Your YARD HUB session has expired. Sign in again.');
 const response=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json','apikey':apiKey(),'x-downtime-session':s.token},body:JSON.stringify({action,...payload})});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw new Error(data.error||'GATELOG request failed.');
 return data;
}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function stamp(value){return value?new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'—'}
function message(text,error=false){const node=$('gatelogMessage');if(node){node.textContent=text;node.className='gatelog-message'+(error?' error':'');node.hidden=!text}}
function showHome(){ $('gatelogWorkspace').hidden=true;document.querySelectorAll('.yard-hub-inner>.yard-hero,.yard-hub-inner>.yard-modules-heading,.yard-hub-inner>.yard-grid,.yard-hub-inner>.yard-hub-footer').forEach(x=>x.hidden=false);window.dispatchEvent(new Event('yard-hub:shown'));window.scrollTo({top:0,behavior:'instant'})}
function open(){const hub=$('yardHub');if(!hub||hub.hidden)return;ensureWorkspace();document.querySelectorAll('.yard-hub-inner>.yard-hero,.yard-hub-inner>.yard-modules-heading,.yard-hub-inner>.yard-grid,.yard-hub-inner>.yard-hub-footer').forEach(x=>x.hidden=true);$('gatelogWorkspace').hidden=false;window.scrollTo({top:0,behavior:'instant'});load().catch(e=>message(e.message,true))}
async function load(){const data=await call('bootstrap');state.customers=data.customers||[];state.vehicles=data.vehicles||[];state.active=data.activeVisits||[];state.wasteTypes=data.wasteTypes||[];render()}
function render(){const host=ensureWorkspace();if(!host)return;host.innerHTML=`
<div class="gatelog-screen">
 <header class="gatelog-head"><button id="gatelogBack" class="gatelog-back">‹ BACK TO YARD HUB</button><div><div class="gatelog-eyebrow">YARD OPERATIONS CORE</div><h1>GATELOG</h1><div class="gatelog-muted">CUSTOMER & SITE ENTRY MANAGEMENT</div></div></header>
 <div id="gatelogMessage" class="gatelog-message" hidden></div>
 <div class="gatelog-kpis"><div class="gatelog-kpi"><strong>${state.active.length}</strong><span>CURRENTLY ON SITE</span></div><div class="gatelog-kpi"><strong>${state.active.filter(v=>v.visit_date===new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'})).length}</strong><span>ARRIVALS TODAY</span></div><div class="gatelog-kpi"><strong>${state.customers.length}</strong><span>SAVED CUSTOMERS</span></div></div>
 <div class="gatelog-grid">
  <section class="gatelog-panel"><h2>NEW ARRIVAL</h2>
   <div class="gatelog-field"><label for="gatelogCustomer">CUSTOMER / COMPANY</label><select id="gatelogCustomer"><option value="">Select customer</option>${state.customers.map(c=>`<option value="${c.id}">${esc(c.customer_name)}</option>`).join('')}</select></div>
   <div class="gatelog-field"><label for="gatelogRegistration">VEHICLE REGISTRATION</label><input id="gatelogRegistration" list="gatelogVehicleList" placeholder="Enter or select registration" autocomplete="off"><datalist id="gatelogVehicleList"></datalist></div>
   <div class="gatelog-field"><label>WASTE TYPE(S) — SELECT ALL THAT APPLY</label><div id="gatelogWaste" class="gatelog-waste">${state.wasteTypes.map(w=>`<label class="gatelog-chip"><input type="checkbox" value="${esc(w.label)}"> ${esc(w.label)}</label>`).join('')}</div><div class="gatelog-field"><input id="gatelogNewWaste" placeholder="Add another waste type"></div></div>
   <div class="gatelog-actions"><button id="gatelogSaveCustomer">SAVE CUSTOMER</button><button id="gatelogArrival" class="gatelog-primary">RECORD ARRIVAL</button></div>
   <div class="gatelog-muted">Time In and visit date are recorded automatically when arrival is saved.</div>
  </section>
  <section class="gatelog-panel"><h2>CURRENTLY ON SITE</h2><div id="gatelogActive" class="gatelog-list">${activeMarkup()}</div></section>
  <section class="gatelog-panel"><h2>ENTRY HISTORY</h2><input id="gatelogSearch" class="gatelog-search" placeholder="Search company, registration or waste type"><div class="gatelog-actions"><button id="gatelogSearchBtn">SEARCH HISTORY</button></div><div id="gatelogHistory" class="gatelog-list"></div></section>
  <section class="gatelog-panel"><h2>CUSTOMER DIRECTORY</h2><div id="gatelogCustomers" class="gatelog-list">${state.customers.map(c=>`<div class="gatelog-row"><div><strong>${esc(c.customer_name)}</strong><small>${state.vehicles.filter(v=>v.customer_id===c.id).map(v=>esc(v.registration)).join(' · ')||'No vehicles saved'}</small></div><span class="gatelog-status">${state.vehicles.filter(v=>v.customer_id===c.id).length} VEHICLES</span></div>`).join('')||'<div class="gatelog-empty">No saved customers yet.</div>'}</div></section>
 </div>
</div>`;
 $('gatelogBack').onclick=showHome;
 $('gatelogCustomer').onchange=()=>{const id=$('gatelogCustomer').value;const vehicles=state.vehicles.filter(v=>v.customer_id===id);$('gatelogVehicleList').innerHTML=vehicles.map(v=>`<option value="${esc(v.registration)}"></option>`).join('')};
 $('gatelogSaveCustomer').onclick=saveCustomer;
 $('gatelogArrival').onclick=arrival;
 $('gatelogSearchBtn').onclick=searchHistory;
 $('gatelogSearch').onkeydown=e=>{if(e.key==='Enter')searchHistory()};
}
function activeMarkup(){return state.active.map(v=>`<div class="gatelog-row"><div><strong>${esc(v.customer_name)} · ${esc(v.vehicle_registration_snapshot)}</strong><small>IN ${stamp(v.time_in)} · ${esc((v.waste_types||[]).join(', '))}</small></div><button data-depart="${v.id}">REGISTER DEPARTURE</button></div>`).join('')||'<div class="gatelog-empty">No vehicles currently on site.</div>'}
async function saveCustomer(){try{const name=prompt('Customer or company name');if(!name?.trim())return;const {customer}=await call('customer-save',{customerName:name});await load();$('gatelogCustomer').value=customer.id;message('Customer saved.');}catch(e){message(e.message,true)}}
async function arrival(){try{const customerId=$('gatelogCustomer').value,registration=$('gatelogRegistration').value.trim().toUpperCase();const wasteTypes=[...document.querySelectorAll('#gatelogWaste input:checked')].map(x=>x.value);const extra=$('gatelogNewWaste').value.trim();if(extra)wasteTypes.push(extra);await call('arrival',{customerId,registration,wasteTypes});await load();message('Arrival recorded. Time In was generated automatically.');}catch(e){message(e.message,true)}}
async function searchHistory(){try{const data=await call('history',{search:$('gatelogSearch').value});$('gatelogHistory').innerHTML=(data.visits||[]).map(v=>`<div class="gatelog-row"><div><strong>${esc(v.customer_name)} · ${esc(v.vehicle_registration_snapshot)}</strong><small>${esc(v.visit_date)} · IN ${stamp(v.time_in)} · OUT ${stamp(v.time_out)}<br>${esc((v.waste_types||[]).join(', '))}</small></div><span class="gatelog-status">${esc(v.status)}</span></div>`).join('')||'<div class="gatelog-empty">No matching visits.</div>';}catch(e){message(e.message,true)}}
document.addEventListener('click',async e=>{const button=e.target.closest('[data-depart]');if(!button)return;button.disabled=true;try{await call('departure',{visitId:button.dataset.depart});await load();message('Departure recorded. Time Out was generated automatically.')}catch(err){message(err.message,true);button.disabled=false}});
document.addEventListener('yard-hub:shown',()=>{if(!$('gatelogWorkspace')?.hidden)load().catch(e=>message(e.message,true))});
window.GATELOG={open,showHome};
const launchButton=$('launchGatelogBtn');if(launchButton)launchButton.addEventListener('click',e=>{e.preventDefault();open()});
})();