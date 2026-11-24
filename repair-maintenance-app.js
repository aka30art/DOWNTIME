(()=>{
  'use strict';
  const API=window.REPAIR_MAINTENANCE_API||'https://ygwfipksbbprqynvbklk.supabase.co/functions/v1/repair-maintenance-api';
  const API_KEY=window.DOWNTIME_CENTRAL_API_KEY||'';
  const MACHINES=[
    {key:'KIVERCO_PICKING_LINE',label:'KIVERCO \u2013 PICKING LINE',sub:'CONVEYOR & SORTING SYSTEM',icon:'assets/rm-icons/kiverco.svg'},
    {key:'TANNA_SHREDDER',label:'TANNA \u2013 SHREDDER',sub:'SHREDDING EQUIPMENT',icon:'assets/rm-icons/tanna.svg'},
    {key:'FORKLIFT',label:'FORKLIFT',sub:'FORKLIFT FLEET',icon:'assets/rm-icons/forklift.svg'},
    {key:'TELEHANDLER',label:'TELEHANDLER',sub:'TELEHANDLER FLEET',icon:'assets/rm-icons/telehandler.svg'},
    {key:'EXCAVATORS_360',label:'360 EXCAVATORS',sub:'EXCAVATOR FLEET',icon:'assets/rm-icons/excavators_360.svg'},
    {key:'OTHER_EQUIPMENT',label:'OTHER EQUIPMENT',sub:'ADDITIONAL MACHINERY',icon:'assets/rm-icons/other_equipment.svg'}
  ];
  const PRIORITIES=['HIGH','MEDIUM','LOW'];
  const STATUSES=['OPEN','PERM. FIX'];
  const $=id=>document.getElementById(id);
  let access=null,currentMachine=null,currentFault=null,faults=[],machinePresets=[],busy=false;
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
    const timestamp=fault=>{const value=Date.parse(fault.created_at||'');return Number.isFinite(value)?value:0};
    const newestFirst=(a,b)=>timestamp(b)-timestamp(a);
    if(mode==='priority')list.sort((a,b)=>PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority)||newestFirst(a,b));
    else if(mode==='newest')list.sort(newestFirst);
    else if(mode==='oldest')list.sort((a,b)=>timestamp(a)-timestamp(b));
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
  function renderPresetSelect(){
    const select=$('newFaultName');if(!select)return;
    select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='SELECT AREA / PART';placeholder.disabled=true;placeholder.selected=true;select.appendChild(placeholder);
    machinePresets.forEach(preset=>{const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name;option.dataset.other=preset.is_other?'true':'false';select.appendChild(option)});
    setOtherAreaVisibility();
  }
  function selectedPreset(){return machinePresets.find(preset=>preset.id===$('newFaultName')?.value)||null}
  function setOtherAreaVisibility(){
    const other=selectedPreset()?.is_other===true,field=$('newFaultOtherField'),input=$('newFaultOther');
    if(field)field.hidden=!other;
    if(input){input.required=other;input.disabled=!other;if(!other)input.value=''}
  }
  async function refreshMachinePresets(){
    if(!currentMachine)return;
    const result=await api('preset-list',{machineType:currentMachine.key});
    machinePresets=Array.isArray(result.presets)?result.presets:[];
    renderPresetSelect();renderPresetManager();
  }
  async function loadMachine(key){
    currentMachine=machine(key);machinePresets=[];setView('dashboardView');const machineIcon=$('machineIcon');if(machineIcon)machineIcon.src=currentMachine.icon;
    $('machineTitle')?.replaceChildren(document.createTextNode(currentMachine.label));
    say('Loading live fault register…');$('faultRows').innerHTML='<div class="empty">Loading fault records…</div>';
    try{
      const result=await api('list',{machineType:currentMachine.key});faults=result.faults||[];renderRows();
      try{await refreshMachinePresets();say(`${faults.length} fault${faults.length===1?'':'s'} loaded · Last refreshed ${new Date().toLocaleTimeString('en-GB')}`,'dashboardStatus','ok')}
      catch(error){renderPresetSelect();say(`Faults loaded, but machine presets could not be loaded: ${error.message}`,'dashboardStatus','error')}
    }catch(error){faults=[];renderRows();say(error.message,'dashboardStatus','error')}
  }
  async function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read selected file.'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file)})}
  async function uploadFile(faultId,file,kind){
    if(!file)return;
    if(file.size>4*1024*1024)throw new Error('File exceeds the 4 MB limit.');
    const dataUrl=await readFile(file);
    return api('upload',{faultId,filename:file.name,mimeType:file.type,kind,dataUrl});
  }
  async function createFault(event){
    event.preventDefault();if(busy||!currentMachine)return;
    const preset=selectedPreset(),description=$('newFaultDescription').value.trim(),otherArea=$('newFaultOther').value.trim();
    if(!preset){say('Select an area / part of machinery.','dashboardStatus','error');return}
    if(preset.is_other&&!otherArea){say('Enter the machinery area or part.','dashboardStatus','error');$('newFaultOther').focus();return}
    if(!description)return;
    const button=$('createFaultSave');button.disabled=true;button.textContent='SAVING…';
    try{
      const result=await api('create',{machineType:currentMachine.key,presetId:preset.id,otherArea,description,priority:$('newFaultPriority').value});
      const photo=$('newFaultPhoto').files?.[0];
      if(photo){try{await uploadFile(result.fault.id,photo,'PHOTO')}catch(error){say(`Fault saved, but photo upload failed: ${error.message}`,'dashboardStatus','error')}}
      $('createForm').reset();renderPresetSelect();closeOverlay('createOverlay');await loadMachine(currentMachine.key);say('Fault / defect created successfully.','dashboardStatus','ok');
    }catch(error){say(error.message,'dashboardStatus','error')}
    finally{button.disabled=false;button.textContent='CREATE FAULT'}
  }
  function renderPresetManager(){
    const host=$('presetItems');if(!host)return;host.replaceChildren();
    if(!machinePresets.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='No presets configured for this machine.';host.appendChild(empty);return}
    machinePresets.forEach(preset=>{
      const row=document.createElement('div');row.className='preset-row';
      const name=document.createElement('strong');name.textContent=preset.name;row.appendChild(name);
      if(preset.is_other){const fixed=document.createElement('small');fixed.textContent='DEFAULT · REQUIRED';row.appendChild(fixed)}
      else{const remove=document.createElement('button');remove.type='button';remove.className='btn danger compact';remove.textContent='REMOVE';remove.addEventListener('click',()=>removeMachinePreset(preset));row.appendChild(remove)}
      host.appendChild(row);
    });
  }
  async function openPresetManager(){
    if(!currentMachine||access?.canManageRepairMaintenancePresets!==true)return;
    try{await refreshMachinePresets();$('presetMachineTitle').textContent=currentMachine.label;showOverlay('presetsOverlay')}
    catch(error){say(error.message,'dashboardStatus','error')}
  }
  async function addMachinePreset(event){
    event.preventDefault();if(busy||!currentMachine)return;
    const name=$('newPresetName').value.trim();if(!name)return;
    const button=$('addPresetSave');button.disabled=true;button.textContent='SAVING…';
    try{await api('preset-add',{machineType:currentMachine.key,name});$('newPresetName').value='';await refreshMachinePresets();say('Machine preset added.','dashboardStatus','ok')}
    catch(error){say(error.message,'dashboardStatus','error')}
    finally{button.disabled=false;button.textContent='ADD PRESET'}
  }
  async function removeMachinePreset(preset){
    if(!currentMachine||!preset||preset.is_other)return;
    if(!window.confirm(`Remove “${preset.name}” from ${currentMachine.label}? Existing fault records will be retained.`))return;
    try{await api('preset-delete',{machineType:currentMachine.key,presetId:preset.id});await refreshMachinePresets();say('Machine preset removed. Existing fault records were not changed.','dashboardStatus','ok')}
    catch(error){say(error.message,'dashboardStatus','error')}
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
  function openReports(){
    if(access?.canExportRepairMaintenanceReports!==true){say('R&M PDF reports are not available for this account.','dashboardStatus','error');return}
    $('reportMachineType').value='';showOverlay('reportOverlay');
  }
  function reportDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('en-GB')}
  function buildPdfDocument(records,filterKey){
    const selected=filterKey?machine(filterKey):null;
    const groups=(selected?[selected]:MACHINES).map(item=>({machine:item,records:records.filter(record=>record.machine_type===item.key)})).filter(group=>group.records.length||selected);
    const total=records.length,count=priority=>records.filter(record=>record.priority===priority).length,generated=new Date().toLocaleString('en-GB');
    const sections=groups.map(group=>{
      const rows=group.records.map((fault,index)=>'<tr><td>'+String(index+1).padStart(2,'0')+'</td><td>'+safe(fault.fault_name)+'</td><td>'+safe(fault.description)+'</td><td><span class="priority '+safe(String(fault.priority||'').toLowerCase())+'">'+safe(fault.priority)+'</span></td><td>'+safe(fault.status)+'</td><td>'+safe(reportDate(fault.created_at))+'</td></tr>').join('');
      return '<section class="machine-section"><h2>'+safe(group.machine.label)+'</h2><table><thead><tr><th>No.</th><th>Area / Part of Machinery</th><th>Type of Defect</th><th>Priority</th><th>Status</th><th>Recorded</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">No faults or defects recorded.</td></tr>')+'</tbody></table></section>';
    }).join('');
    const scope=selected?selected.label:'ALL MACHINERY';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R&M PDF REPORTS — '+safe(scope)+'</title><style>'+
      '*{box-sizing:border-box}body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#17212b;margin:0;padding:28px}header{border-bottom:4px solid #ffc400;padding:0 0 16px;margin-bottom:18px}h1{font-size:25px;margin:0;font-weight:900}header p{font-size:12px;letter-spacing:2px;font-weight:800;margin:5px 0 0;color:#526475}header h2{font-size:16px;margin:18px 0 4px}header small{color:#526475}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0 22px}.metric{border:1px solid #cbd4dc;padding:10px;border-radius:6px}.metric small{display:block;color:#526475;font-size:10px;font-weight:800;text-transform:uppercase}.metric strong{display:block;font-size:22px;margin-top:4px}.machine-section{margin:0 0 25px;break-inside:auto}.machine-section h2{font-size:17px;background:#edf2f5;border-left:5px solid #ffc400;padding:9px 11px;margin:0 0 8px;break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #cbd4dc;padding:7px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e3eaf0;font-size:10px;text-transform:uppercase;letter-spacing:.35px}td{font-size:11px}.priority{display:inline-block;font-weight:800;font-size:10px}.priority.high{color:#b4232d}.priority.medium{color:#926b00}.priority.low{color:#536475}footer{border-top:1px solid #cbd4dc;padding-top:10px;margin-top:20px;color:#526475;font-size:10px}@page{size:auto;margin:12mm}@media(max-width:650px){body{padding:14px}.summary{grid-template-columns:repeat(2,1fr)}th,td{padding:5px;font-size:9px}}@media print{body{padding:0}header{break-after:avoid}}'+
      '</style></head><body><header><h1>R&M — REPAIRS &amp; MAINTENANCE</h1><p>MACHINERY DEFECT &amp; FAULT REGISTER</p><h2>'+safe(scope)+'</h2><small>Report generated: '+safe(generated)+' · Records: '+total+'</small></header><div class="summary"><div class="metric"><small>Total faults</small><strong>'+total+'</strong></div><div class="metric"><small>High priority</small><strong>'+count('HIGH')+'</strong></div><div class="metric"><small>Medium priority</small><strong>'+count('MEDIUM')+'</strong></div><div class="metric"><small>Low priority</small><strong>'+count('LOW')+'</strong></div></div>'+sections+'<footer>YARD HUB · R&amp;M · INTERNAL MAINTENANCE REPORT</footer><script>window.addEventListener("load",()=>window.print());</script></body></html>';
  }
  async function generatePdfReport(){
    if(access?.canExportRepairMaintenanceReports!==true){say('R&M PDF reports are not available for this account.','dashboardStatus','error');return}
    const button=$('generatePdfReport'),filterKey=$('reportMachineType').value||null,win=window.open('','_blank');
    if(!win){say('Allow pop-ups to generate the R&M PDF report.','dashboardStatus','error');return}
    win.document.open();win.document.write('<!doctype html><html><head><title>Preparing R&M PDF report</title></head><body style="font:16px Arial;padding:32px;color:#17212b">Preparing R&amp;M report…</body></html>');win.document.close();
    button.disabled=true;button.textContent='PREPARING REPORT…';
    try{
      const result=await api('report-list',filterKey?{machineType:filterKey}:{}),records=Array.isArray(result.faults)?result.faults:[];
      win.document.open();win.document.write(buildPdfDocument(records,filterKey));win.document.close();
      closeOverlay('reportOverlay');say('R&M PDF report prepared · '+records.length+' record(s). Use Print → Save as PDF.','dashboardStatus','ok');
    }catch(error){
      if(!win.closed){win.document.open();win.document.write('<!doctype html><html><head><title>R&amp;M report unavailable</title></head><body style="font:16px Arial;padding:32px;color:#17212b"><h1>R&amp;M report unavailable</h1><p>'+safe(error.message)+'</p><p>Close this tab and try again.</p></body></html>');win.document.close()}
      say(error.message,'dashboardStatus','error');
    }finally{button.disabled=false;button.textContent='GENERATE PDF REPORT'}
  }
  function applyPermissions(){
    const edit=access.canEditRepairMaintenance===true,del=access.canDeleteRepairMaintenance===true,exp=access.canExportRepairMaintenanceReports===true;
    ['openCreateFault','updateFault','toggleNoteComposer','detailAddNote','attachFile','addPhoto'].forEach(id=>{const e=$(id);if(e)e.disabled=!edit});
    $('deleteFault').hidden=!del;$('openReports').hidden=!exp;
    $('openPresets').hidden=access.canManageRepairMaintenancePresets!==true;
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
    $('openCreateFault').addEventListener('click',()=>{if(currentMachine){renderPresetSelect();showOverlay('createOverlay')}});$('createForm').addEventListener('submit',createFault);
    $('newFaultName').addEventListener('change',setOtherAreaVisibility);$('openPresets').addEventListener('click',openPresetManager);$('presetAddForm').addEventListener('submit',addMachinePreset);
    $('updateFault').addEventListener('click',updateFault);$('detailPriority').addEventListener('change',renderDetailPriority);
    $('toggleNoteComposer').addEventListener('click',startNote);$('detailAddNote')?.addEventListener('click',startNote);$('saveNote').addEventListener('click',saveNote);$('cancelNote').addEventListener('click',()=>$('noteComposer').classList.remove('open'));
    $('addPhoto').addEventListener('click',()=>$('photoInput').click());$('photoInput').addEventListener('change',e=>doUpload(e.target.files?.[0],'PHOTO'));
    $('attachFile')?.addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>doUpload(e.target.files?.[0],'FILE'));
    $('deleteFault').addEventListener('click',deleteFault);
    $('openReports').addEventListener('click',openReports);$('generatePdfReport').addEventListener('click',generatePdfReport);
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeOverlay(button.dataset.close)));
    document.querySelectorAll('.overlay').forEach(overlay=>overlay.addEventListener('click',e=>{if(e.target===overlay)closeOverlay(overlay.id)}));
    init();
  });
})();
