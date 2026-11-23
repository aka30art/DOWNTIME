(()=> {
  'use strict';
  const $=id=>document.getElementById(id);
  const API=()=>window.YARD_HUB_SETTINGS_API||'';
  const roles=['OWNER','DEVACC','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR'];
  const roleLabels={OWNER:'OWNER · ROOT',DEVACC:'DEVACC',ADMIN:'ADMIN',MANAGER:'MANAGER',SUPERVISOR:'SUPERVISOR',USER:'USER',SPECTATOR:'SPECTATOR'};
  const sections=[
    {key:'floor',label:'FLOOR'},
    {key:'checkSheets',label:'CHECK SHEETS'},
    {key:'repairMaintenance',label:'REPAIRS & MAINTENANCE'}
  ];
  const modes=['NONE','READ','EDIT'];
  let state=null,workingPayload=null,editingUsername=null,saving=false;

  function currentSession(){return window.DowntimeCentral?.session||null}
  function currentUser(){return currentSession()?.user||null}
  function actorTier(){return String(currentUser()?.tier||'').toUpperCase()}
  function isSettingsAdmin(){
    const user=currentUser(),tier=actorTier(),username=String(user?.username||'').trim().toUpperCase();
    return (username==='DEV'&&tier==='OWNER')||tier==='DEVACC'||tier==='ADMIN';
  }
  function isRootAdmin(){
    const username=String(currentUser()?.username||'').trim().toUpperCase();
    return (username==='DEV'&&actorTier()==='OWNER')||actorTier()==='DEVACC';
  }
  function setStatus(message,type=''){
    const node=$('yardHubSettingsStatus');
    if(!node)return;
    node.textContent=message||'';
    node.dataset.state=type;
  }
  function setBusy(value){
    saving=value;
    ['yardHubUserSave','yardHubUserDelete','yardHubTierSave'].forEach(id=>{const b=$(id);if(b)b.disabled=value});
  }
  async function callApi(action,body={}){
    const session=currentSession();
    if(!session?.token)throw new Error('Your Yard Hub session has expired. Sign in again.');
    if(!API())throw new Error('YARD HUB Settings API is not configured.');
    const headers={'Content-Type':'application/json'};
    const key=String(window.DOWNTIME_CENTRAL_API_KEY||'').trim();
    if(key)headers.apikey=key;
    headers['x-downtime-session']=session.token;
    const response=await fetch(API(),{method:'POST',headers,body:JSON.stringify({action,...body})});
    let result={};try{result=await response.json()}catch{}
    if(!response.ok){const error=new Error(result.error||'YARD HUB Settings request failed.');error.status=response.status;throw error}
    return result;
  }
  async function loadState(){
    const result=await callApi('settings-state');
    state=result;
    workingPayload=JSON.parse(JSON.stringify(result.tierPermissions));
    renderUsers();
    renderTierCards();
    updateTierSaveState();
    return result;
  }
  function setHomeVisible(settings){
    const hub=$('yardHub');
    if(!hub)return;
    const grid=hub.querySelector('.yard-grid');
    const heading=hub.querySelector('.yard-modules-heading');
    const footer=hub.querySelector('.yard-hub-footer');
    const screen=$('yardHubSettingsScreen');
    if(grid)grid.hidden=settings;
    if(heading)heading.hidden=settings;
    if(footer)footer.hidden=settings;
    if(screen)screen.hidden=!settings;
  }
  function showSettingsHome(){
    $('yardHubSettingsHome').hidden=false;
    $('yardHubUsersView').hidden=true;
    $('yardHubTiersView').hidden=true;
    $('yardHubUserModal').hidden=true;
    $('yardHubSettingsTitle').textContent='YARD HUB SETTINGS';
    setStatus('');
  }
  function openSettingsView(view){
    $('yardHubSettingsHome').hidden=true;
    $('yardHubUsersView').hidden=view!=='users';
    $('yardHubTiersView').hidden=view!=='tiers';
    $('yardHubUserModal').hidden=true;
    $('yardHubSettingsTitle').textContent=view==='users'?'USERS':'TIERS';
    setStatus('');
    if(view==='users')renderUsers();
    if(view==='tiers')renderTierCards();
  }
  async function openSettings(){
    if(!isSettingsAdmin())return;
    setStatus('VERIFYING SETTINGS ACCESS…');
    try{
      await loadState();
      setHomeVisible(true);
      showSettingsHome();
      setStatus('');
    }catch(error){
      setStatus(error.message||'Unable to open YARD HUB Settings.','error');
    }
  }
  function closeSettings(){
    if(hasUnsavedTierChanges()&&!window.confirm('Discard unsaved YARD HUB permission changes?'))return;
    setHomeVisible(false);
    showSettingsHome();
    setStatus('');
  }
  function hasUnsavedTierChanges(){
    return !!state&&JSON.stringify(workingPayload)!==JSON.stringify(state.tierPermissions);
  }
  function canEditRole(role){
    if(isRootAdmin())return true;
    return actorTier()==='ADMIN'&&['MANAGER','SUPERVISOR','USER','SPECTATOR'].includes(role);
  }
  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function renderUsers(){
    const host=$('yardHubUsersList');
    if(!host||!state)return;
    host.replaceChildren();
    const users=Array.isArray(state.users)?state.users:[];
    if(!users.length){
      host.appendChild(element('p','yard-hub-empty','No central user accounts found.'));
      return;
    }
    const me=String(currentUser()?.username||'').toLowerCase();
    users.forEach(user=>{
      const row=element('article','yard-hub-user-row');
      const identity=element('div','yard-hub-user-identity');
      identity.appendChild(element('strong','',user.displayName||user.username));
      identity.appendChild(element('small','',user.username));
      const meta=element('div','yard-hub-user-meta');
      meta.appendChild(element('span','yard-hub-tier-tag',user.tier));
      meta.appendChild(element('span',user.enabled===false?'yard-hub-status off':'yard-hub-status',user.enabled===false?'DISABLED':'ACTIVE'));
      const actions=element('div','yard-hub-user-actions');
      const protectedRoot=user.tier==='OWNER'||String(user.username).toUpperCase()==='DEV';
      const protectedDevacc=user.tier==='DEVACC'&&!isRootAdmin();
      const edit=element('button','yard-hub-small-button','EDIT');
      edit.type='button';
      edit.disabled=protectedRoot&&!isRootAdmin()||protectedDevacc;
      edit.addEventListener('click',()=>openUserModal(user));
      actions.appendChild(edit);
      const remove=element('button','yard-hub-small-button danger','DELETE');
      remove.type='button';
      remove.disabled=user.tier==='OWNER'||String(user.username).toLowerCase()===me||protectedDevacc;
      remove.addEventListener('click',()=>deleteUser(user));
      actions.appendChild(remove);
      row.append(identity,meta,actions);
      host.appendChild(row);
    });
  }
  function allowedUserTiers(existingTier){
    const options=['ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR'];
    const actorName=String(currentUser()?.username||'').toUpperCase();
    if(actorName==='DEV'||(existingTier==='DEVACC'&&isRootAdmin()))options.splice(1,0,'DEVACC');
    if(existingTier==='OWNER')options.unshift('OWNER');
    return options;
  }
  function openUserModal(user=null){
    editingUsername=user?String(user.username):null;
    const form=$('yardHubUserForm');
    form.reset();
    $('yardHubUserModal').hidden=false;
    $('yardHubUserModalTitle').textContent=user?'EDIT USER':'ADD USER';
    $('yardHubUserUsername').value=user?.username||'';
    $('yardHubUserUsername').disabled=!!user;
    $('yardHubUserDisplay').value=user?.displayName||'';
    $('yardHubUserPin').value='';
    $('yardHubUserPin').required=!user;
    $('yardHubUserPin').placeholder=user?'Leave blank to keep the current PIN':'4–8 digit PIN';
    $('yardHubUserEnabled').checked=user?.enabled!==false;
    $('yardHubUserEnabled').disabled=!!user&&String(user.username).toUpperCase()==='DEV';
    $('yardHubUserTier').replaceChildren();
    allowedUserTiers(user?.tier).forEach(role=>{
      const option=element('option','',role);
      option.value=role;
      $('yardHubUserTier').appendChild(option);
    });
    $('yardHubUserTier').value=user?.tier||'USER';
    $('yardHubUserTier').disabled=!!user&&user.tier==='OWNER';
    $('yardHubUserSave').textContent=user?'SAVE USER':'ADD USER';
    $('yardHubUserDelete').hidden=!user||user.tier==='OWNER'||String(user.username).toLowerCase()===String(currentUser()?.username||'').toLowerCase()||(user.tier==='DEVACC'&&!isRootAdmin());
    $('yardHubUserDelete').disabled=false;
    if(user?.tier==='DEVACC'&&!isRootAdmin())setStatus('Only DEV or DEVACC can modify a DEVACC account.','error');
    $('yardHubUserUsername').focus();
  }
  function closeUserModal(){
    $('yardHubUserModal').hidden=true;
    editingUsername=null;
    $('yardHubUserForm').reset();
  }
  async function saveUser(event){
    event.preventDefault();
    if(saving||!state)return;
    const username=String($('yardHubUserUsername').value||'').trim();
    const displayName=String($('yardHubUserDisplay').value||'').trim();
    const tier=String($('yardHubUserTier').value||'USER');
    const pin=String($('yardHubUserPin').value||'');
    const enabled=$('yardHubUserEnabled').checked;
    if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)){setStatus('Username must be 2–32 letters, numbers, dots, underscores or hyphens.','error');return}
    if(!displayName||displayName.length>80){setStatus('Enter a display name of up to 80 characters.','error');return}
    if(pin&&(!/^[0-9]{4,8}$/.test(pin))){setStatus('PIN must contain 4–8 digits.','error');return}
    if(!editingUsername&&!pin){setStatus('A PIN is required for a new user.','error');return}
    if(tier==='DEVACC'&&String(currentUser()?.username||'').toUpperCase()!=='DEV'&&editingUsername===null){setStatus('Only root DEV can assign the DEVACC tier.','error');return}
    const data={username,displayName,tier,enabled};
    if(pin)data.pin=pin;
    setBusy(true);setStatus('SAVING USER ACCOUNT…');
    try{
      const result=await window.DowntimeCentral.saveUser(data,state.centralVersion);
      state.centralVersion=Number(result.version||state.centralVersion+1);
      const editingSelf=String(username).toLowerCase()===String(currentUser()?.username||'').toLowerCase();
      closeUserModal();
      await loadState();
      if(editingSelf){
        setStatus('Your account was updated. Sign in again with your current credentials.','ok');
        try{await window.DowntimeCentral.logout()}catch{}
        window.location.reload();
        return;
      }
      setStatus('USER ACCOUNT SAVED.','ok');
    }catch(error){
      setStatus(error.message||'Unable to save the user account.','error');
    }finally{setBusy(false)}
  }
  async function deleteUser(user){
    if(saving||!state)return;
    if(String(user.username).toLowerCase()===String(currentUser()?.username||'').toLowerCase())return;
    if(!window.confirm('Permanently delete the account '+user.username+'? This cannot be undone.'))return;
    setBusy(true);setStatus('DELETING USER ACCOUNT…');
    try{
      const result=await window.DowntimeCentral.deleteUser(user.username,state.centralVersion);
      state.centralVersion=Number(result.version||state.centralVersion+1);
      await loadState();
      setStatus('USER ACCOUNT DELETED.','ok');
    }catch(error){setStatus(error.message||'Unable to delete the user account.','error')}
    finally{setBusy(false)}
  }
  function renderTierCards(){
    const host=$('yardHubTierCards');
    if(!host||!workingPayload)return;
    host.replaceChildren();
    roles.forEach(role=>{
      const editable=canEditRole(role);
      const card=element('article','yard-hub-tier-card'+(editable?'':' locked'));
      const heading=element('header','yard-hub-tier-card-head');
      const title=element('strong','',roleLabels[role]);
      const description=element('small','',role==='OWNER'?'Root DEV account':role==='DEVACC'?'Root-equivalent account':role==='ADMIN'?'YARD HUB administrator':'Operational account tier');
      heading.append(title,description);
      card.appendChild(heading);
      const table=element('div','yard-hub-permission-table');
      const downtone=element('div','yard-hub-permission-row external');
      downtone.appendChild(element('strong','','DOWNTIME'));
      downtone.appendChild(element('span','yard-hub-external-tag','MANAGED IN DOWNTIME · ACCESS & RIGHTS'));
      table.appendChild(downtone);
      sections.forEach(section=>{
        const current=workingPayload.tiers?.[role]?.[section.key]||'NONE';
        const row=element('div','yard-hub-permission-row');
        row.appendChild(element('strong','',section.label));
        const controls=element('div','yard-hub-checks');
        ['READ','EDIT'].forEach(mode=>{
          const label=element('label','yard-hub-check-option '+mode.toLowerCase());
          const box=document.createElement('input');
          box.type='checkbox';
          box.checked=current===mode;
          box.disabled=!editable;
          box.addEventListener('change',()=>{
            if(!editable)return;
            workingPayload.tiers[role][section.key]=box.checked?mode:(workingPayload.tiers[role][section.key]===mode?'NONE':workingPayload.tiers[role][section.key]);
            renderTierCards();
            updateTierSaveState();
          });
          label.append(box,element('span','',mode));
          controls.appendChild(label);
        });
        row.appendChild(controls);
        table.appendChild(row);
      });
      if(!editable)card.appendChild(element('div','yard-hub-tier-lock-note','Protected tier · only DEV / DEVACC can change this profile.'));
      card.appendChild(table);
      host.appendChild(card);
    });
  }
  function updateTierSaveState(){
    const button=$('yardHubTierSave');
    if(button)button.disabled=saving||!hasUnsavedTierChanges();
  }
  async function saveTierSettings(){
    if(saving||!state||!hasUnsavedTierChanges())return;
    setBusy(true);setStatus('SAVING YARD HUB PERMISSIONS…');
    try{
      const result=await callApi('save-tier-settings',{version:state.permissionVersion,payload:workingPayload});
      await loadState();
      setStatus('YARD HUB TIER PERMISSIONS SAVED.','ok');
    }catch(error){
      setStatus(error.message||'Unable to save YARD HUB permissions.','error');
      if(error.status===409){try{await loadState()}catch{}}
    }finally{setBusy(false);updateTierSaveState()}
  }
  function configureButton(){
    const button=$('yardHubSettingsBtn');
    if(!button)return;
    button.hidden=!isSettingsAdmin();
  }
  function bind(){
    const button=$('yardHubSettingsBtn');
    button?.addEventListener('click',openSettings);
    $('yardHubSettingsBack')?.addEventListener('click',closeSettings);
    $('yardHubSettingsUsers')?.addEventListener('click',()=>openSettingsView('users'));
    $('yardHubSettingsTiers')?.addEventListener('click',()=>openSettingsView('tiers'));
    document.querySelectorAll('[data-yard-settings-home]').forEach(button=>button.addEventListener('click',showSettingsHome));
    $('yardHubUserAdd')?.addEventListener('click',()=>openUserModal());
    $('yardHubUserCancel')?.addEventListener('click',closeUserModal);
    $('yardHubUserForm')?.addEventListener('submit',saveUser);
    $('yardHubUserDelete')?.addEventListener('click',()=>{
      const user=state?.users?.find(item=>item.username===editingUsername);
      if(user)deleteUser(user).then(()=>closeUserModal());
    });
    $('yardHubTierSave')?.addEventListener('click',saveTierSettings);
    $('yardHubTierReset')?.addEventListener('click',async()=>{
      if(!state||!hasUnsavedTierChanges())return;
      if(!window.confirm('Discard unsaved permission changes?'))return;
      workingPayload=JSON.parse(JSON.stringify(state.tierPermissions));
      renderTierCards();updateTierSaveState();setStatus('');
    });
    $('yardHubUserModal')?.addEventListener('click',event=>{if(event.target===$('yardHubUserModal'))closeUserModal()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('yardHubUserModal')?.hidden)closeUserModal()});
    window.addEventListener('yard-hub:shown',configureButton);
    configureButton();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();