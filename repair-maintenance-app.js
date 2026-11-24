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
  let access=null,currentMachine=null,currentAsset=null,currentFault=null,faults=[],machinePresets=[],assets=[],unassignedCount=0,unassignedMode=false,editingAssetId=null,busy=false,exportOffset=0,exportsLoading=false;
  const sessionToken=()=>window.DowntimeCentral?.session?.token||'';
  const headers=()=>({'Content-Type':'application/json','apikey':API_KEY,'x-downtime-session':sessionToken()});
  async function api(action,body={},timeoutMs=15000){
    if(!sessionToken())throw new Error('Your YARD HUB session has expired. Return to YARD HUB and sign in again.');
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);let response;try{response=await fetch(API,{method:'POST',headers:headers(),body:JSON.stringify({action,...body}),signal:controller.signal})}catch(error){if(error.name==='AbortError')throw new Error('R&M request timed out after '+Math.ceil(timeoutMs/1000)+' seconds. Check your connection and retry.');throw new Error('Session verification could not reach the R&M service. Check your connection and retry.')}finally{clearTimeout(timeout)}
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw new Error(data.error||`R&M request failed (${response.status}).`);
    return data;
  }
  function say(message,target='dashboardStatus',kind=''){
    const el=$(target);if(!el)return;el.hidden=false;el.textContent=message;el.className='statusbar'+(kind?' '+kind:'');
  }
  function clearStatus(target){const el=$(target);if(!el)return;el.textContent='';el.className='statusbar';el.hidden=true;}
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
  function setRegisterMessage(message){
    faults=[];renderStats();const host=$('faultRows');host.replaceChildren();
    const empty=document.createElement('div');empty.className='empty';empty.textContent=message;host.appendChild(empty);
  }
  function renderAssetSelect(){
    const select=$('machineAssetSelect');if(!select)return;
    select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='SELECT INDIVIDUAL MACHINE';select.appendChild(placeholder);
    assets.forEach(asset=>{
      const option=document.createElement('option');option.value=asset.id;
      option.textContent=[asset.asset_code,asset.name,asset.make_model,asset.status==='ARCHIVED'?'ARCHIVED':null].filter(Boolean).join(' · ');
      select.appendChild(option);
    });
    if(unassignedCount>0){const legacy=document.createElement('option');legacy.value='__UNASSIGNED__';legacy.textContent='UNASSIGNED / LEGACY FAULTS ('+unassignedCount+')';select.appendChild(legacy)}
    $('machineAssetControls').hidden=access?.canReadRepairMaintenanceMachinery!==true;
    $('addMachineryButton').hidden=access?.canManageRepairMaintenanceMachinery!==true;
    $('editMachineryButton').hidden=true;
    select.value='';
  }
  async function loadMachine(key){
    currentMachine=machine(key);currentAsset=null;unassignedMode=false;assets=[];unassignedCount=0;machinePresets=[];
    setView('dashboardView');
    const icon=$('machineIcon');if(icon)icon.src=currentMachine.icon;
    $('machineCategoryLabel').textContent=currentMachine.sub;
    $('machineTitle').textContent='SELECT A MACHINE';
    $('machineAssetControls').hidden=access?.canReadRepairMaintenanceMachinery!==true;
    $('machineAssetSelect').replaceChildren(new Option('LOADING MACHINERY…',''));
    setRegisterMessage(access?.canReadRepairMaintenanceMachinery===true?'Loading registered machines…':'Your tier does not have READ access to R&M MACHINERY.');
    applyPermissions();
    if(access?.canReadRepairMaintenanceMachinery!==true){say('R&M MACHINERY READ permission is required to select an individual machine.','dashboardStatus','error');return}
    try{
      const result=await api('asset-list',{machineType:currentMachine.key});
      assets=Array.isArray(result.assets)?result.assets:[];
      unassignedCount=Number(result.unassignedCount)||0;
      renderAssetSelect();
      const active=assets.filter(asset=>asset.status==='ACTIVE');
      if(active.length===1){
        $('machineAssetSelect').value=active[0].id;
        await selectMachineAsset(active[0].id);
      }else if(active.length>1){
        setRegisterMessage('Select an individual machine from the dropdown to view its own fault register.');
        say(active.length+' active machines registered in this category. Select one to continue.','dashboardStatus','ok');
      }else if(assets.length>0){
        setRegisterMessage(unassignedCount>0
          ? 'No active machines. Archived machines remain selectable for history; unassigned legacy faults are also available.'
          : 'No active machines. Archived machines remain selectable to view their historical fault records.');
        say('No active machines are registered in this category.','dashboardStatus','ok');
      }else if(unassignedCount>0){
        setRegisterMessage('No machines are registered yet. Select UNASSIGNED / LEGACY FAULTS to review existing records, or add a machine.');
        say(unassignedCount+' existing fault record(s) are not yet assigned to a machine.','dashboardStatus','ok');
      }else{
        setRegisterMessage('No machines are registered in this category yet. Use ADD MACHINERY to register the first machine.');
        say('Machinery register is ready.','dashboardStatus','ok');
      }
      applyPermissions();
    }catch(error){
      assets=[];unassignedCount=0;renderAssetSelect();setRegisterMessage(error.message);say(error.message,'dashboardStatus','error');
    }
  }
  async function selectMachineAsset(value){
    if(!currentMachine||!value)return;
    unassignedMode=value==='__UNASSIGNED__';
    currentAsset=unassignedMode?null:assets.find(asset=>asset.id===value)||null;
    if(!unassignedMode&&!currentAsset){say('The selected machine is no longer available. Refresh the category and try again.','dashboardStatus','error');return}
    $('machineTitle').textContent=unassignedMode?'UNASSIGNED / LEGACY FAULTS':currentAsset.name;
    $('machineAssetSelect').value=value;
    $('editMachineryButton').hidden=access?.canManageRepairMaintenanceMachinery!==true||!currentAsset;
    const canCreate=access?.canEditRepairMaintenance===true&&!unassignedMode&&currentAsset?.status==='ACTIVE';
    $('openCreateFault').hidden=!canCreate;
    $('openCreateFault').disabled=!canCreate;
    setRegisterMessage('Loading fault records…');
    try{
      const args=unassignedMode?{machineType:currentMachine.key,unassigned:true}:{machineType:currentMachine.key,assetId:currentAsset.id};
      const result=await api('list',args);faults=Array.isArray(result.faults)?result.faults:[];renderRows();
      try{await refreshMachinePresets();say(`${faults.length} fault${faults.length===1?'':'s'} loaded · ${unassignedMode?'Legacy records':currentAsset.name} · ${new Date().toLocaleTimeString('en-GB')}`,'dashboardStatus','ok')}
      catch(error){renderPresetSelect();say(`Faults loaded, but machine presets could not be loaded: ${error.message}`,'dashboardStatus','error')}
    }catch(error){faults=[];renderRows();say(error.message,'dashboardStatus','error')}
    applyPermissions();
  }
  async function reloadCurrentRegister(){
    if(!currentMachine)return;
    const selected=unassignedMode?'__UNASSIGNED__':currentAsset?.id;
    if(selected)return selectMachineAsset(selected);
  }
  function openAssetEditor(asset=null){
    if(access?.canManageRepairMaintenanceMachinery!==true||!currentMachine)return;
    editingAssetId=asset?.id||null;
    clearStatus('assetStatus');
    $('assetMachineType').textContent=currentMachine.label;
    $('assetName').value=asset?.name||'';
    $('assetCode').value=asset?.asset_code||'';
    $('assetMakeModel').value=asset?.make_model||'';
    $('assetEditorTitle').textContent=asset?'EDIT MACHINERY':'ADD MACHINERY';
    $('assetSaveButton').textContent=asset?'SAVE CHANGES':'ADD MACHINERY';
    $('archiveAssetButton').hidden=!asset||asset.status!=='ACTIVE';
    showOverlay('assetOverlay');
  }
  async function saveAsset(event){
    event.preventDefault();if(!currentMachine||access?.canManageRepairMaintenanceMachinery!==true)return;
    const button=$('assetSaveButton');button.disabled=true;button.textContent='SAVING…';
    try{
      const payload={machineType:currentMachine.key,name:$('assetName').value.trim(),assetCode:$('assetCode').value.trim(),makeModel:$('assetMakeModel').value.trim()};
      const result=editingAssetId?await api('asset-update',{...payload,assetId:editingAssetId}):await api('asset-add',payload);
      const saved=result.asset;if(!saved)throw new Error('The R&M service did not confirm the machinery record.');
      closeOverlay('assetOverlay');await loadMachine(currentMachine.key);
      if(saved.status==='ACTIVE'){ $('machineAssetSelect').value=saved.id; await selectMachineAsset(saved.id); }
      say(editingAssetId?'Machine details updated.':'Machine registered successfully.','dashboardStatus','ok');
    }catch(error){say(error.message,'assetStatus','error')}
    finally{button.disabled=false;button.textContent=editingAssetId?'SAVE CHANGES':'ADD MACHINERY'}
  }
  async function archiveCurrentAsset(){
    if(!currentMachine||!currentAsset||access?.canManageRepairMaintenanceMachinery!==true)return;
    if(!window.confirm('Archive “'+currentAsset.name+'”? Its fault history and evidence will be retained, but new faults cannot be added.'))return;
    const button=$('archiveAssetButton');button.disabled=true;button.textContent='ARCHIVING…';
    try{
      await api('asset-archive',{machineType:currentMachine.key,assetId:currentAsset.id});
      closeOverlay('assetOverlay');say('Machine archived. Its fault history remains available.','dashboardStatus','ok');
      await loadMachine(currentMachine.key);
    }catch(error){say(error.message,'assetStatus','error')}
    finally{button.disabled=false;button.textContent='ARCHIVE MACHINE'}
  }
  async function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read selected file.'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file)})}
  async function uploadFile(faultId,file,kind){
    if(!file)return;
    if(file.size>4*1024*1024)throw new Error('File exceeds the 4 MB limit.');
    const dataUrl=await readFile(file);
    return api('upload',{faultId,filename:file.name,mimeType:file.type,kind,dataUrl});
  }
  async function createFault(event){
    event.preventDefault();if(busy||!currentMachine||!currentAsset||unassignedMode||currentAsset.status!=='ACTIVE')return;
    const preset=selectedPreset(),description=$('newFaultDescription').value.trim(),otherArea=$('newFaultOther').value.trim();
    if(!preset){say('Select an area / part of machinery.','dashboardStatus','error');return}
    if(preset.is_other&&!otherArea){say('Enter the machinery area or part.','dashboardStatus','error');$('newFaultOther').focus();return}
    if(!description)return;
    const button=$('createFaultSave');button.disabled=true;button.textContent='SAVING…';
    try{
      const result=await api('create',{machineType:currentMachine.key,assetId:currentAsset.id,presetId:preset.id,otherArea,description,priority:$('newFaultPriority').value});
      const photo=$('newFaultPhoto').files?.[0];
      if(photo){try{await uploadFile(result.fault.id,photo,'PHOTO')}catch(error){say(`Fault saved, but photo upload failed: ${error.message}`,'dashboardStatus','error')}}
      $('createForm').reset();renderPresetSelect();closeOverlay('createOverlay');await reloadCurrentRegister();say('Fault / defect created successfully.','dashboardStatus','ok');
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
      $('detailNumber').textContent=String(number).padStart(2,'0');$('detailName').textContent=currentFault.fault_name;$('detailMachine').textContent=currentAsset?(currentAsset.asset_code?currentAsset.asset_code+' · ':'')+currentAsset.name:(unassignedMode?'UNASSIGNED / LEGACY FAULTS':machine(currentFault.machine_type).label);
      $('detailDescription').textContent=currentFault.description;const statusSelect=$('detailStatus');statusSelect.querySelectorAll('option[data-legacy="true"]').forEach(option=>option.remove());if(![...statusSelect.options].some(option=>option.value===currentFault.status)){const legacyStatus=document.createElement('option');legacyStatus.value=currentFault.status;legacyStatus.textContent=currentFault.status;legacyStatus.dataset.legacy='true';statusSelect.appendChild(legacyStatus)}statusSelect.value=currentFault.status;$('detailPriority').value=currentFault.priority;clearStatus('detailUpdateStatus');
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
  async function updateFault(){if(!currentFault||busy)return;const button=$('updateFault'),status=$('detailStatus').value,priority=$('detailPriority').value;button.disabled=true;button.textContent='SAVING…';clearStatus('detailUpdateStatus');say('Saving fault updates…','detailUpdateStatus');try{const result=await api('update',{faultId:currentFault.id,status,priority});if(!result.fault)throw new Error('The R&M service did not confirm that the fault was updated.');currentFault=result.fault;closeOverlay('detailsOverlay');await reloadCurrentRegister();say('Fault / defect updated.','dashboardStatus','ok')}catch(error){say(error.message,'detailUpdateStatus','error');say(error.message,'dashboardStatus','error')}finally{button.disabled=false;button.textContent='✓ UPDATE';renderDetailPriority()}}
  function startNote(){if(!currentFault)return;$('noteComposer').classList.add('open');$('noteText').focus()}
  async function saveNote(){const note=$('noteText').value.trim();if(!currentFault||!note)return;const button=$('saveNote');button.disabled=true;try{await api('note-add',{faultId:currentFault.id,note});$('noteText').value='';$('noteComposer').classList.remove('open');await refreshDetails()}catch(error){say(error.message,'dashboardStatus','error')}finally{button.disabled=false}}
  async function doUpload(file,kind){if(!currentFault||!file)return;const button=kind==='PHOTO'?$('addPhoto'):$('attachFile');button.disabled=true;try{await uploadFile(currentFault.id,file,kind);await refreshDetails();say(`${kind==='PHOTO'?'Photo':'File'} attached successfully.`,'dashboardStatus','ok')}catch(error){say(error.message,'dashboardStatus','error')}finally{button.disabled=false;$('photoInput').value='';$('fileInput').value=''}}
  async function deleteFault(){if(!currentFault||busy)return;if(!window.confirm(`Mark “${currentFault.fault_name}” as PERM. FIX? This will keep its record, notes, and attachments.`))return;const button=$('deleteFault');button.disabled=true;button.textContent='SAVING…';try{await api('update',{faultId:currentFault.id,status:'PERM. FIX',priority:currentFault.priority});closeOverlay('detailsOverlay');await reloadCurrentRegister();say('Fault / defect marked PERM. FIX.','dashboardStatus','ok')}catch(error){say(error.message,'dashboardStatus','error')}finally{button.disabled=false;button.textContent='✓ SOLVED'}}
  async function populateAssetFilter(typeId,assetId,includeUnassigned=false){
    const typeSelect=$(typeId),assetSelect=$(assetId);if(!typeSelect||!assetSelect)return;
    const machineType=typeSelect.value||'';
    const previous=assetSelect.value;assetSelect.replaceChildren();
    const all=document.createElement('option');all.value='';all.textContent='ALL MACHINES IN CATEGORY';assetSelect.appendChild(all);
    if(!machineType){assetSelect.disabled=true;return}
    assetSelect.disabled=false;
    try{
      const result=await api('asset-list',{machineType});
      (result.assets||[]).forEach(asset=>{
        const option=document.createElement('option');option.value=asset.id;
        option.textContent=[asset.asset_code,asset.name,asset.status==='ARCHIVED'?'ARCHIVED':null].filter(Boolean).join(' · ');
        assetSelect.appendChild(option);
      });
      if(includeUnassigned&&Number(result.unassignedCount)>0){const option=document.createElement('option');option.value='__UNASSIGNED__';option.textContent='UNASSIGNED / LEGACY FAULTS';assetSelect.appendChild(option)}
      if([...assetSelect.options].some(option=>option.value===previous))assetSelect.value=previous;
    }catch(error){say(error.message,'dashboardStatus','error')}
  }
  function openReportGenerator(){
    if(access?.canExportRepairMaintenanceReports!==true){say('R&M PDF reports are not available for this account.','dashboardStatus','error');return}
    $('reportMachineType').value=currentMachine?.key||'';
    $('reportAssetId').value='';
    showOverlay('reportOverlay');
    if(currentMachine){
      populateAssetFilter('reportMachineType','reportAssetId',true).then(()=>{
        $('reportAssetId').value=unassignedMode?'__UNASSIGNED__':(currentAsset?.id||'');
      });
    }else populateAssetFilter('reportMachineType','reportAssetId',true);
  }
  function reportDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-GB')}
  function reportFileSize(value){const n=Number(value)||0;return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(n/1024))+' KB'}
  function renderPdfExports(reports){const host=$('pdfExportList');reports.forEach(report=>{const row=document.createElement('article');row.className='pdf-export-row';const main=document.createElement('div');main.className='pdf-export-main';const name=document.createElement('strong');name.className='pdf-export-name';name.textContent=report.file_name||'R&M PDF REPORT';main.appendChild(name);const meta=document.createElement('span');meta.className='pdf-export-meta';meta.textContent=(report.asset_name|| (report.machine_type?machine(report.machine_type).label:'ALL MACHINERY'))+' · '+(Number(report.record_count)||0)+' record(s) · '+reportDate(report.created_at)+' · '+reportFileSize(report.file_size_bytes);main.appendChild(meta);const actions=document.createElement('div');actions.className='pdf-export-actions';[['display','DISPLAY','btn'],['print','PRINT','btn'],['delete','DELETE','btn delete-export']].forEach(([action,label,cls])=>{if(action==='delete'&&access?.canDeleteRepairMaintenance!==true)return;const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',()=>action==='delete'?deletePdfExport(report):openPdfExport(report,action));actions.appendChild(b)});row.append(main,actions);host.appendChild(row)})}
  async function loadPdfExports(reset=true){if(exportsLoading)return;exportsLoading=true;const host=$('pdfExportList'),more=$('loadMoreExports');if(reset){exportOffset=0;host.replaceChildren();const loading=document.createElement('div');loading.className='empty';loading.textContent='Loading PDF exports…';host.appendChild(loading);more.hidden=true}try{const result=await api('export-list',{machineType:$('pdfExportsMachineType').value||'',assetId:$('pdfExportsAssetId').value||'',offset:exportOffset});const reports=Array.isArray(result.reports)?result.reports:[];if(reset)host.replaceChildren();renderPdfExports(reports);exportOffset+=reports.length;more.hidden=result.hasMore!==true;if(reset&&!reports.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No PDF exports found for this machinery filter.';host.appendChild(empty)}}catch(error){if(reset){host.replaceChildren();const e=document.createElement('div');e.className='empty';e.textContent=error.message;host.appendChild(e)}say(error.message,'dashboardStatus','error')}finally{exportsLoading=false}}
  function openReports(){if(access?.canExportRepairMaintenanceReports!==true){say('R&M PDF reports are not available for this account.','dashboardStatus','error');return}$('pdfExportsMachineType').value='';$('pdfExportsAssetId').value='';showOverlay('exportsOverlay');populateAssetFilter('pdfExportsMachineType','pdfExportsAssetId').then(()=>loadPdfExports(true))}
  async function openPdfExport(report,mode){const popup=window.open('about:blank','_blank');if(!popup){say('Allow pop-ups to open the selected PDF export.','dashboardStatus','error');return}popup.document.write('<!doctype html><title>Opening PDF export</title><p style="font:15px Arial;padding:28px">Opening stored R&amp;M PDF…</p>');try{const r=await api('export-url',{reportId:report.id});if(mode==='print')popup.addEventListener('load',()=>{try{popup.focus();popup.print()}catch{}},{once:true});popup.location.replace(r.signedUrl)}catch(error){popup.close();say(error.message,'dashboardStatus','error')}}
  async function deletePdfExport(report){if(access?.canDeleteRepairMaintenance!==true){say('Only R&M edit accounts can delete PDF exports.','dashboardStatus','error');return}if(!window.confirm('Delete “'+report.file_name+'” from PDF EXPORTS? This cannot be undone.'))return;try{await api('export-delete',{reportId:report.id});say('PDF export deleted.','dashboardStatus','ok');await loadPdfExports(true)}catch(error){say(error.message,'dashboardStatus','error')}}
  async function generatePdfReport(){if(access?.canExportRepairMaintenanceReports!==true){say('R&M PDF reports are not available for this account.','dashboardStatus','error');return}const b=$('generatePdfReport'),machineType=$('reportMachineType').value||'',assetChoice=$('reportAssetId').value||'';const filters=machineType?{machineType}:{};if(assetChoice==='__UNASSIGNED__')filters.unassigned=true;else if(assetChoice)filters.assetId=assetChoice;b.disabled=true;b.textContent='CREATING PDF…';try{const r=await api('export-create',filters,90000);closeOverlay('reportOverlay');$('pdfExportsMachineType').value=machineType;$('pdfExportsAssetId').value=assetChoice&&!assetChoice.startsWith('__')?assetChoice:'';say('PDF report saved to PDF EXPORTS · '+(r.report?.file_name||'Report created'),'dashboardStatus','ok');showOverlay('exportsOverlay');await populateAssetFilter('pdfExportsMachineType','pdfExportsAssetId').then(()=>{$('pdfExportsAssetId').value=$('reportAssetId').value==='__UNASSIGNED__'?'':$('reportAssetId').value});await loadPdfExports(true)}catch(error){say(error.message,'dashboardStatus','error')}finally{b.disabled=false;b.textContent='GENERATE PDF REPORT'}}
  function applyPermissions(){
    const edit=access.canEditRepairMaintenance===true,del=access.canDeleteRepairMaintenance===true,exp=access.canExportRepairMaintenanceReports===true;
    ['updateFault','toggleNoteComposer','detailAddNote','attachFile','addPhoto'].forEach(id=>{const e=$(id);if(e)e.disabled=!edit});
    const canCreate=edit&&!unassignedMode&&currentAsset?.status==='ACTIVE';
    $('openCreateFault').hidden=!canCreate;$('openCreateFault').disabled=!canCreate;
    $('deleteFault').hidden=!del;$('openReports').hidden=!exp;$('exportReportButton').hidden=!exp;$('pdfExportsButton').hidden=!exp;
    $('openPresets').hidden=access.canManageRepairMaintenancePresets!==true;
    $('addMachineryButton').hidden=access.canManageRepairMaintenanceMachinery!==true;
    $('editMachineryButton').hidden=access.canManageRepairMaintenanceMachinery!==true||!currentAsset;
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
    $('machineAssetSelect')?.addEventListener('change',event=>selectMachineAsset(event.target.value));
    $('addMachineryButton')?.addEventListener('click',()=>openAssetEditor());
    $('editMachineryButton')?.addEventListener('click',()=>openAssetEditor(currentAsset));
    $('assetForm')?.addEventListener('submit',saveAsset);
    $('archiveAssetButton')?.addEventListener('click',archiveCurrentAsset);
    $('sortSelect').addEventListener('change',renderRows);
    $('backToMachinery').addEventListener('click',renderSelector);$('backToHub').addEventListener('click',()=>{window.location.assign('index.html')});
    $('openCreateFault').addEventListener('click',()=>{if(currentMachine&&currentAsset&&currentAsset.status==='ACTIVE'&&!unassignedMode){renderPresetSelect();showOverlay('createOverlay')}});$('createForm').addEventListener('submit',createFault);
    $('newFaultName').addEventListener('change',setOtherAreaVisibility);$('openPresets').addEventListener('click',openPresetManager);$('presetAddForm').addEventListener('submit',addMachinePreset);
    $('updateFault').addEventListener('click',updateFault);$('detailPriority').addEventListener('change',renderDetailPriority);
    $('toggleNoteComposer').addEventListener('click',startNote);$('detailAddNote')?.addEventListener('click',startNote);$('saveNote').addEventListener('click',saveNote);$('cancelNote').addEventListener('click',()=>$('noteComposer').classList.remove('open'));
    $('addPhoto').addEventListener('click',()=>$('photoInput').click());$('photoInput').addEventListener('change',e=>doUpload(e.target.files?.[0],'PHOTO'));
    $('attachFile')?.addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>doUpload(e.target.files?.[0],'FILE'));
    $('deleteFault').addEventListener('click',deleteFault);
    $('openReports').addEventListener('click',openReports);$('pdfExportsButton').addEventListener('click',openReports);$('exportReportButton').addEventListener('click',openReportGenerator);$('generatePdfReport').addEventListener('click',generatePdfReport);$('pdfExportsMachineType').addEventListener('change',()=>populateAssetFilter('pdfExportsMachineType','pdfExportsAssetId').then(()=>loadPdfExports(true)));$('pdfExportsAssetId').addEventListener('change',()=>loadPdfExports(true));$('reportMachineType').addEventListener('change',()=>populateAssetFilter('reportMachineType','reportAssetId',true));$('loadMoreExports').addEventListener('click',()=>loadPdfExports(false));
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeOverlay(button.dataset.close)));
    document.querySelectorAll('.overlay').forEach(overlay=>overlay.addEventListener('click',e=>{if(e.target===overlay)closeOverlay(overlay.id)}));
    init();
  });
})();
