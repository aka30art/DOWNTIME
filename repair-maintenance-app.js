(()=>{
  'use strict';
  const API=window.REPAIR_MAINTENANCE_API||'https://ygwfipksbbprqynvbklk.supabase.co/functions/v1/repair-maintenance-api';
  const API_KEY=window.DOWNTIME_CENTRAL_API_KEY||'';
  const MACHINES=[
    {key:'KIVERCO_PICKING_LINE',label:'KIVERCO \u2013 PICKING LINE',sub:'CONVEYOR & SORTING SYSTEM'},
    {key:'TANNA_SHREDDER',label:'TANNA \u2013 SHREDDER',sub:'SHREDDING EQUIPMENT'},
    {key:'FORKLIFT',label:'FORKLIFT',sub:'FORKLIFT FLEET'},
    {key:'TELEHANDLER',label:'TELEHANDLER',sub:'TELEHANDLER FLEET'},
    {key:'EXCAVATORS_360',label:'360 EXCAVATORS',sub:'EXCAVATOR FLEET'},
    {key:'OTHER_EQUIPMENT',label:'OTHER EQUIPMENT',sub:'ADDITIONAL MACHINERY'}
  ];
  const PRIORITIES=['HIGH','MEDIUM','LOW'];
  const STATUSES=['OPEN','PERM. FIX'];
  const $=id=>document.getElementById(id);
  let access=null,currentMachine=null,currentFault=null,faults=[],busy=false;
  const sessionToken=()=>window.DowntimeCentral?.session?.token||'';
  const headers=()=>({'Content-Type':'application/json','apikey':API_KEY,'x-downtime-session':sessionToken()});
  async function api(action,body={}){
    if(!sessionToken())throw new Error('Your YARD HUB session has expired. Return to YARD HUB and sign in again.');
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);let response;try{response=await fetch(API,{method:'POST',headers:headers(),body:JSON.stringify({action,...body}),signal:controller.signal})}catch(error){if(error.name==='AbortError')throw new Error('Session verification timed out after 15 seconds. Check your connection and retry.');throw new Error('Session verification could not reach the R&M service. Check your connection and retry.')}finally{clearTimeout(timeout)}
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw new Error(data.error||`R&M request failed (${response.status}).`);
    return data;
  }
  function say(message,target='dashboardStatus',kind=''){
    const el=$(target);if(!el)return;el.textContent=message;el.className='statusbar'+(kind?' '+kind:'');
  }
  function safe(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function machine(key){return MACHINES.find(m=>m.key===key)||MACHINES[0]}
  function priorityClass(value){return String(value||'LOW').toLowerCase()}
  function setView(id){['selectorView','dashboardView'].forEach(view=>$(view).hidden=view!==id);}
  function showOverlay(id){$(id)?.classList.add('open');document.body.style.overflow='hidden'}
  function closeOverlay(id){$(id)?.classList.remove('open');if(!document.querySelector('.overlay.open'))document.body.style.overflow=''}
  function setBusy(value){busy=value;document.querySelectorAll('button').forEach(b=>{if(b.dataset.busyControl==='true')b.disabled=value})}
  function renderSelector(){setView('selectorView');$('selectorStatus').textContent='Select a machinery category to view its fault register.';}
  function renderStats(){
    $('totalCount').textContent=faults.length;
    $('highCount').textContent=faults.filter(f=>f.priority==='HIGH').length;
    $('mediumCount').textContent=faults.filter(f=>f.priority==='MEDIUM').length;
    $('lowCount').textContent=faults.filter(f=>f.priority==='LOW').length;
  }
  function orderedFaults(){
    const list=[...faults],mode=$('sortSelect').value;
    if(mode==='priority')list.sort((a,b)=>PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority)||new Date(b.created_at)-new Date(a.created_at));
    else if(mode==='recent')list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    else list.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    return list;
  }
  function renderRows(){
    renderStats();const host=$('faultRows');host.replaceChildren();const list=orderedFaults();
    if(!list.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No faults or defects are currently recorded for this machine.';host.append(empty);return}
    list.forEach((fault,index)=>{
      const row=document.createElement('button');row.type='button';row.className='faultrow';row.setAttribute('aria-label',`Open fault ${fault.fault_name}, priority ${fault.priority}`);
      row.innerHTML=`<span class="rownum">${String(index+1).padStart(2,'0')}</span><span class="faultname">${safe(fault.fault_name)}</span><span class="description">${safe(fault.description)}</span><span class="priority-pill ${priorityClass(fault.priority)}">${safe(fault.priority)}</span>`;
      row.addEventListener('click',()=>openDetails(fault.id,index+1));host.append(row);
    });
  }
  async function loadMachine(key){
    currentMachine=machine(key);setView('dashboardView');
    $('machineTitle')?.replaceChildren(document.createTextNode(currentMachine.label));
    say('Loading live fault register\u2026');$('faultRows').innerHTML='<div class="empty">Loading fault records…</div>';
    try{const result=await api('list',{machineType:currentMachine.key});faults=result.faults||[];renderRows();say(`${faults.length} fault${faults.length===1?'':'s'} loaded · Last refreshed ${new Date().toLocaleTimeString('en-GB')}`,'dashboardStatus','ok')}
    catch(error){faults=[];renderRows();say(error.message,'dashboardStatus','error')}
  }
  async function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read selected file.'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file)})}
  async function uploadFile(faultId,file,kind){
    if(!file)return;
    if(file.size>4*1024*1024)throw new Error('File exceeds the 4 MB limit.');
    const dataUrl=await readFile(file);
    return api('upload',{faultId,filename:file.name,mimeType:file.type,kind,dataUrl});
  }
  async function createFault(event){
    event.preventDefault();if(busy)return;
    const name=$('newFaultName').value.trim(),description=$('newFaultDescription').value.trim();
    if(!name||!description)return;
    const button=$('createFaultSave');button.disabled=true;button.textContent='SAVING…';
    try{
      const result=await api('create',{machineType:currentMachine.key,faultName:name,description,priority:$('newFaultPriority').value,status:$('newFaultStatus').value});
      const photo=$('newFaultPhoto').files?.[0];
      if(photo){try{await uploadFile(result.fault.id,photo,'PHOTO')}catch(error){say(`Fault saved, but photo upload failed: ${error.message}`,'dashboardStatus','error')}}
      $('createForm').reset();closeOverlay('createOverlay');await loadMachine(currentMachine.key);say('Fault / defect created successfully.','dashboardStatus','ok');
    }catch(error){say(error.message,'dashboardStatus','error')}
    finally{button.disabled=false;button.textContent='CREATE FAULT'}
  }
  async function openDetails(id,number){
    try{
      const result=await api('get',{faultId:id});currentFault=result.fault;currentFault.displayNumber=number;
      $('detailNumber').textContent=String(number).padStart(2,'0');$('detailName').textContent=currentFault.fault_name;$('detailMachine').textContent=machine(currentFault.machine_type).label;
      $('detailDescription').textContent=currentFault.description;$('detailStatus').value=currentFault.status;$('detailPriority').value=currentFault.priority;
      renderDetailPriority();renderEvidence(result.attachments||[]);renderNotes(result.notes||[]);
      const editable=access.canEditRepairMaintenance===true;
      ['detailStatus','detailPriority','updateFault','toggleNoteComposer','detailAddNote','attachFile','addPhoto'].forEach(id=>{const e=$(id);if(e)e.disabled=!editable});
      $('deleteFault').hidden=access.canEditRepairMaintenance!==true;
      showOverlay('detailsOverlay');
    }catch(error){say(error.message,'dashboardStatus','error')}
  }
  function renderDetailPriority(){const v=$('detailPriority').value;$('detailPriorityText').textContent=v;$('detailPriorityTag').style.borderColor=v==='HIGH'?'#ff2028':v==='MEDIUM'?'#ffd21a':'#aab5c0';}
  function renderEvidence(items){
    const photos=items.filter(x=>x.kind==='PHOTO'),files=items.filter(x=>x.kind!=='PHOTO');$('photoCount').textContent=photos.length;$('fileCount').textContent=files.length;
    $('photoItems').innerHTML=photos.map(x=>`<a href="${safe(x.signedUrl)}" target="_blank" rel="noopener"><img class="photo-thumb" src="${safe(x.signedUrl)}" alt="${safe(x.filename)}"></a>`).join('');
    $('fileItems').innerHTML=files.map(x=>`<a class="file-chip" href="${safe(x.signedUrl)}" target="_blank" rel="noopener">📎 ${safe(x.filename)}</a>`).join('');
  }
  function renderNotes(notes){$('notesList').innerHTML=notes.length?notes.map(n=>`<div class="note-item">${safe(n.note)}<small>${safe(n.created_by)} · ${safe(new Date(n.created_at).toLocaleString('en-GB'))}</small></div>`).join(''):'<div class="empty" style="padding:12px">No notes recorded.</div>'}
  async function refreshDetails(){if(!currentFault)return;const result=await api('get',{faultId:currentFault.id});currentFault=result.fault;renderEvidence(result.attachments||[]);renderNotes(result.notes||[]);}
  async function updateFault(){if(!currentFault||busy)return;const button=$('updateFault');button.disabled=true;button.textContent='SAVING…';try{await api('update',{faultId:currentFault.id,status:$('detailStatus').value,priority:$('detailPriority').value});closeOverlay('detailsOverlay');await loadMachine(currentMachine.key);say('Fault / defect updated.','dashboardStatus','ok')}catch(error){say(error.message,'dashboardStatus','error')}finally{button.disabled=false;button.textContent='✓ UPDATE';renderDetailPriority()}}
  function startNote(){if(!currentFault)return;$('noteComposer').classList.add('open');$('noteText').focus()}
  async function saveNote(){const note=$('noteText').value.trim();if(!currentFault||!note)return;const button=$('saveNote');button.disabled=true;try{await api('note-add',{faultId:currentFault.id,note});$('noteText').value='';$('noteComposer').classList.remove('open');await refreshDetails()}catch(error){say(error.message,'dashboardStatus','error')}finally{button.disabled=false}}
  async function doUpload(file,kind){if(!currentFault||!file)return;const button=kind==='PHOTO'?$('addPhoto'):$('attachFile');button.disabled=true;try{await uploadFile(currentFault.id,file,kind);await refreshDetails();say(`${kind==='PHOTO'?'Photo':'File'} attached successfully.`,'dashboardStatus','ok')}catch(error){say(error.message,'dashboardStatus','error')}finally{button.disabled=false;$('photoInput').value='';$('fileInput').value=''}}
  async function deleteFault(){if(!currentFault||busy)return;if(!window.confirm(`Mark “${currentFault.fault_name}” as PERM. FIX? This will keep its record, notes, and attachments.`))return;const button=$('deleteFault');button.disabled=true;button.textContent='SAVING…';try{await api('update',{faultId:currentFault.id,status:'PERM. FIX',priority:currentFault.priority});closeOverlay('detailsOverlay');await loadMachine(currentMachine.key);say('Fault / defect marked PERM. FIX.','dashboardStatus','ok')}catch(error){say(error.message,'dashboardStatus','error')}finally{button.disabled=false;button.textContent='✓ SOLVED'}}
  function exportReport(){if(access.canExportRepairMaintenanceReports!==true){say('Report export is not permitted for this account.','dashboardStatus','error');return}const date=new Date().toLocaleDateString('en-GB');const rows=orderedFaults().map((f,i)=>`<tr><td>${i+1}</td><td>${safe(f.fault_name)}</td><td>${safe(f.description)}</td><td>${safe(f.priority)}</td><td>${safe(f.status)}</td><td>${safe(new Date(f.created_at).toLocaleString('en-GB'))}</td></tr>`).join('');const win=window.open('','_blank');if(!win){say('Allow pop-ups to export this report as PDF.','dashboardStatus','error');return}win.document.write(`<!doctype html><html><head><title>R&M ${safe(currentMachine.label)} Report</title><meta name=viewport content=width=device-width,initial-scale=1><style>body{font:14px Arial,sans-serif;color:#111;padding:28px}h1{margin:0}h2{margin:8px 0 22px;color:#333}small{color:#555}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #777;padding:9px;text-align:left;vertical-align:top}th{background:#eee}footer{margin-top:20px;color:#555}@media print{body{padding:0}}</style></head><body><h1>R&M — REPAIRS & MAINTENANCE</h1><h2>${safe(currentMachine.label)} — FAULT REGISTER</h2><small>Report generated: ${safe(date)} · ${faults.length} fault record(s)</small><table><thead><tr><th>No.</th><th>Part / Area of Plant</th><th>Type of Defect</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead><tbody>${rows||'<tr><td colspan=6>No faults currently recorded.</td></tr>'}</tbody></table><footer>YARD HUB · R&M</footer><script>window.onload=()=>window.print();</script></body></html>`);win.document.close();say('PDF report opened. Use Print → Save as PDF.','dashboardStatus','ok')}
  function applyPermissions(){
    const edit=access.canEditRepairMaintenance===true,del=access.canDeleteRepairMaintenance===true,exp=access.canExportRepairMaintenanceReports===true;
    ['openCreateFault','updateFault','toggleNoteComposer','detailAddNote','attachFile','addPhoto'].forEach(id=>{const e=$(id);if(e)e.disabled=!edit});
    $('deleteFault').hidden=!del;$('exportReport').hidden=!exp;
  }
  async function init(){
    const session=window.DowntimeCentral?.session;
    if(!session?.token){$('loadingView').hidden=true;document.querySelector('.frame').hidden=true;$('accessDenied').classList.add('show');$('accessDeniedMessage').textContent='No active YARD HUB session. Open R&M from YARD HUB after signing in.';return}
    try{
      const result=await api('access');access=result.permissions||{};
      if(!access.canAccessYardHub||!access.canAccessRepairMaintenance)throw new Error('This account does not have access to YARD HUB · R&M. Contact an administrator.');
      $('sessionUser').textContent=String(result.user?.displayName||result.user?.username||'AUTHENTICATED USER').toUpperCase();
      applyPermissions();$('loadingView').hidden=true;renderSelector();
    }catch(error){$('loadingView').hidden=true;document.querySelector('.frame').hidden=true;$('accessDenied').classList.add('show');$('accessDeniedMessage').textContent=error.message;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('retrySession')?.addEventListener('click',()=>{document.querySelector('.frame').hidden=false;$('accessDenied').classList.remove('show');$('loadingView').hidden=false;init()});
    document.querySelectorAll('.machine-card').forEach(button=>button.addEventListener('click',()=>loadMachine(button.dataset.machine)));
    $('sortSelect').addEventListener('change',renderRows);
    $('backToMachinery').addEventListener('click',renderSelector);$('backToHub').addEventListener('click',()=>{window.location.assign('index.html')});
    $('openCreateFault').addEventListener('click',()=>{if(currentMachine)showOverlay('createOverlay')});$('createForm').addEventListener('submit',createFault);
    $('updateFault').addEventListener('click',updateFault);$('detailPriority').addEventListener('change',renderDetailPriority);
    $('toggleNoteComposer').addEventListener('click',startNote);$('detailAddNote').addEventListener('click',startNote);$('saveNote').addEventListener('click',saveNote);$('cancelNote').addEventListener('click',()=>$('noteComposer').classList.remove('open'));
    $('addPhoto').addEventListener('click',()=>$('photoInput').click());$('photoInput').addEventListener('change',e=>doUpload(e.target.files?.[0],'PHOTO'));
    $('attachFile').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>doUpload(e.target.files?.[0],'FILE'));
    $('deleteFault').addEventListener('click',deleteFault);$('exportReport').addEventListener('click',exportReport);$('printReport').addEventListener('click',()=>window.print());
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeOverlay(button.dataset.close)));
    document.querySelectorAll('.overlay').forEach(overlay=>overlay.addEventListener('click',e=>{if(e.target===overlay)closeOverlay(overlay.id)}));
    init();
  });
})();
