(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const API=()=>window.YARD_HUB_SETTINGS_API||'';
  const roles=['OWNER','DEVACC','ADMIN','MANAGER','SUPERVISOR','MECHANIC','USER','SPECTATOR'];
  const editableByAdmin=['MANAGER','SUPERVISOR','MECHANIC','USER','SPECTATOR'];
  const roleLabels={OWNER:'OWNER · ROOT',DEVACC:'DEVACC',ADMIN:'ADMIN',MANAGER:'MANAGER',SUPERVISOR:'SUPERVISOR',MECHANIC:'MECHANIC',USER:'USER',SPECTATOR:'SPECTATOR'};
  const sections=[{key:'floor',label:'FLOOR'},{key:'checkSheets',label:'CHECK SHEETS'},{key:'repairMaintenance',label:'REPAIRS & MAINTENANCE'},{key:'repairMaintenanceMachinery',label:'R&M MACHINERY'}];
  const modes=['NONE','READ','INPUT','EDIT'];
  const allRoles=()=>[...roles,...(Array.isArray(workingPayload?.customTiers)?workingPayload.customTiers:[])];
  let state=null,workingPayload=null,editingUsername=null,saving=false,myHubTier=null,myCanManageSettings=false,accessRefresh=null;

  function currentSession(){return window.DowntimeCentral?.session||null}
  function currentUser(){return currentSession()?.user||null}
  function legacyTier(){return String(currentUser()?.tier||'USER').toUpperCase()}
  function rootDev(){return String(currentUser()?.username||'').trim().toUpperCase()==='DEV'&&legacyTier()==='OWNER'}
  function isRootAdmin(){return rootDev()||myHubTier==='DEVACC'}
  function isSettingsAdmin(){return rootDev()||myHubTier==='DEVACC'||myHubTier==='ADMIN'}
  function setStatus(message,type=''){
    const node=$('yardHubSettingsStatus');
    if(!node)return;
    node.textContent=message||'';
    node.dataset.state=type;
  }
  function setBusy(value){
    saving=value;
    ['yardHubUserSave','yardHubUserStatus','yardHubTierSave'].forEach(id=>{const b=$(id);if(b)b.disabled=value});
    const addUser=$('yardHubUserAdd');
    if(addUser)addUser.disabled=value||state?.canManageCentralUsers!==true;
  }
  async function callApi(action,body={}){
    const session=currentSession();
    if(!session?.token)throw new Error('Your YARD HUB session has expired. Sign in again.');
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
  async function refreshHubAccess(){
    const button=$('yardHubSettingsBtn');
    if(button){button.hidden=true;button.dataset.accessChecked='false';}
    myHubTier=null;myCanManageSettings=false;
    if(!currentSession()?.token)return null;
    try{
      const result=await callApi('my-access');
      myHubTier=String(result.user?.hubTier||'USER').toUpperCase();
      myCanManageSettings=result.canManageSettings===true;
      if(button)button.hidden=!myCanManageSettings;
      return result;
    }catch(error){
      if(button)button.hidden=true;
      console.warn('YARD HUB access profile could not be refreshed.',error);
      return null;
    }
  }
  async function configureButton(){
    const button=$('yardHubSettingsBtn');
    if(!currentSession()?.token){
      if(button){button.hidden=true;button.dataset.accessChecked='false'}
      return null;
    }
    if(accessRefresh)return accessRefresh;
    accessRefresh=refreshHubAccess().finally(()=>{if(button)button.dataset.accessChecked='true';accessRefresh=null});
    return accessRefresh;
  }
  async function loadState(){
    const result=await callApi('settings-state');
    state=result;
    myHubTier=String(result.user?.hubTier||myHubTier||'USER').toUpperCase();
    myCanManageSettings=true;
    workingPayload=JSON.parse(JSON.stringify(result.tierPermissions));
    renderUsers();renderTierCards();updateTierSaveState();
    const addUser=$('yardHubUserAdd');
    if(addUser)addUser.disabled=saving||result.canManageCentralUsers!==true;
    return result;
  }
  function setHomeVisible(settings){
    const hub=$('yardHub');if(!hub)return;
    const hero=hub.querySelector('.yard-hero'),grid=hub.querySelector('.yard-grid'),heading=hub.querySelector('.yard-modules-heading'),footer=hub.querySelector('.yard-hub-footer'),screen=$('yardHubSettingsScreen');
    [hero,grid,heading,footer].forEach(node=>{if(node)node.hidden=settings});
    if(screen)screen.hidden=!settings;
    if(settings){
      window.scrollTo({top:0,behavior:'instant'});
      requestAnimationFrame(()=>screen?.focus({preventScroll:true}));
    }else{
      window.scrollTo({top:0,behavior:'instant'});
      $('yardHubSettingsBtn')?.focus({preventScroll:true});
    }
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
    setStatus('VERIFYING SETTINGS ACCESS…');
    try{
      const access=await configureButton();
      if(!access?.canManageSettings||!isSettingsAdmin())throw new Error('YARD HUB SETTINGS is restricted to DEV, DEVACC and ADMIN.');
      await loadState();
      setHomeVisible(true);showSettingsHome();setStatus('');
    }catch(error){
      setStatus(error.message||'Unable to open YARD HUB Settings.','error');
    }
  }
  function closeSettings(){
    if(hasUnsavedTierChanges()&&!window.confirm('Discard unsaved YARD HUB permission changes?'))return;
    setHomeVisible(false);showSettingsHome();setStatus('');
  }
  function hasUnsavedTierChanges(){return !!state&&JSON.stringify(workingPayload)!==JSON.stringify(state.tierPermissions)}
  function canEditRole(role){
    if(isRootAdmin())return true;
    return myHubTier==='ADMIN'&&editableByAdmin.includes(role);
  }
  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function userIsProtected(user){
    return String(user.username||'').toUpperCase()==='DEV'||user.hubTier==='OWNER'||user.hubTier==='DEVACC'||user.hubTier==='ADMIN';
  }
  function renderUsers(){
    const host=$('yardHubUsersList');if(!host||!state)return;
    host.replaceChildren();
    const users=Array.isArray(state.users)?state.users:[];
    if(!users.length){host.appendChild(element('p','yard-hub-empty','No central user accounts found.'));return}
    const me=String(currentUser()?.username||'').toLowerCase();
    users.forEach(user=>{
      const row=element('article','yard-hub-user-row');
      row.dataset.username=user.username;
      const identity=element('div','yard-hub-user-identity');
      identity.appendChild(element('strong','',user.displayName||user.username));
      identity.appendChild(element('small','',user.username));
      const meta=element('div','yard-hub-user-meta');
      meta.appendChild(element('span','yard-hub-tier-tag','YARD HUB · '+(user.hubTier||'USER')));
      meta.appendChild(element('span','yard-hub-legacy-tag','DOWNTIME · '+(user.legacyTier||'USER')));
      meta.appendChild(element('span',user.enabled===false?'yard-hub-status off':'yard-hub-status',user.enabled===false?'DISABLED':'ACTIVE'));
      const actions=element('div','yard-hub-user-actions');
      const protectedUser=userIsProtected(user)&&!isRootAdmin();
      const isSelf=String(user.username).toLowerCase()===me;
      const edit=element('button','yard-hub-small-button','EDIT');
      edit.type='button';edit.disabled=saving||isSelf||protectedUser;
      edit.title=isSelf?'Use a different administrator account to edit this account.':protectedUser?'Protected tier account.':'Edit user';
      edit.addEventListener('click',()=>openUserModal(user));
      actions.appendChild(edit);
      const status=element('button','yard-hub-small-button '+(user.enabled===false?'':'danger'),user.enabled===false?'RE-ENABLE':'DISABLE');
      status.type='button';status.disabled=saving||state.canManageCentralUsers!==true||isSelf||protectedUser||(String(user.username).toUpperCase()==='DEV');
      status.addEventListener('click',()=>setUserEnabled(user,user.enabled===false));
      actions.appendChild(status);
      row.append(identity,meta,actions);host.appendChild(row);
    });
  }
  function allowedHubTiers(existingTier,username){
    if(isRootAdmin()){
      const options=allRoles().filter(role=>role!=='OWNER'&&(role!=='DEVACC'||rootDev()));
      if(existingTier==='DEVACC'&&!options.includes('DEVACC'))options.unshift('DEVACC');
      if(username?.toUpperCase()==='DEV')return ['OWNER'];
      return options;
    }
    return editableByAdmin.slice();
  }
  function openUserModal(user=null){
    if(user&&String(user.username).toLowerCase()===String(currentUser()?.username||'').toLowerCase()){
      setStatus('Use a different administrator account to modify your own user record.','error');return;
    }
    if(user&&userIsProtected(user)&&!isRootAdmin()){
      setStatus('This user has a protected YARD HUB tier.','error');return;
    }
    const canManageCentralUsers=state?.canManageCentralUsers===true;
    if(!user&&!canManageCentralUsers){setStatus('Your administrator account does not have the existing Central Users management right.','error');return}
    editingUsername=user?String(user.username):null;
    $('yardHubUserForm').reset();
    $('yardHubUserModal').hidden=false;
    $('yardHubUserModalTitle').textContent=user?'EDIT USER':'ADD USER';
    $('yardHubUserUsername').value=user?.username||'';
    $('yardHubUserUsername').disabled=!!user||!canManageCentralUsers;
    $('yardHubUserDisplay').value=user?.displayName||'';
    $('yardHubUserDisplay').disabled=!canManageCentralUsers;
    $('yardHubUserPin').value='';
    $('yardHubUserPin').required=!user;
    $('yardHubUserPin').disabled=!canManageCentralUsers;
    $('yardHubUserPin').placeholder=user?'Leave blank to keep current PIN':'4–8 digit PIN';
    $('yardHubUserEnabled').checked=user?.enabled!==false;
    $('yardHubUserEnabled').disabled=!canManageCentralUsers;
    $('yardHubUserDowntimeTier').textContent=user?(user.legacyTier||'USER'):'USER · SAFE DEFAULT';
    $('yardHubUserHubTier').replaceChildren();
    allowedHubTiers(user?.hubTier,user?.username||'').forEach(role=>{
      const option=element('option','',roleLabels[role]);option.value=role;
      $('yardHubUserHubTier').appendChild(option);
    });
    $('yardHubUserHubTier').value=user?.hubTier||'USER';
    $('yardHubUserModalHint').textContent=user
      ?'DOWNTIME tier is preserved exactly. Changes below affect YARD HUB only.'
      :'New accounts are created with the restricted DOWNTIME USER tier. Choose a separate YARD HUB tier.';
    $('yardHubUserSave').textContent=user?'SAVE USER':'ADD USER';
    $('yardHubUserStatus').hidden=!user||!canManageCentralUsers;
    if(user)$('yardHubUserStatus').textContent=user.enabled===false?'RE-ENABLE ACCOUNT':'DISABLE ACCOUNT';
    $('yardHubUserUsername').focus();
  }
  function closeUserModal(){
    $('yardHubUserModal').hidden=true;editingUsername=null;
    $('yardHubUserForm').reset();
  }
  async function saveUser(event){
    event.preventDefault();
    if(saving||!state)return;
    const username=String($('yardHubUserUsername').value||'').trim();
    const displayName=String($('yardHubUserDisplay').value||'').trim();
    const hubTier=String($('yardHubUserHubTier').value||'USER').toUpperCase();
    const pin=String($('yardHubUserPin').value||'');
    const enabled=$('yardHubUserEnabled').checked;
    const existing=editingUsername?state.users.find(user=>String(user.username).toLowerCase()===editingUsername.toLowerCase()):null;
    const downtimeTier=existing?.legacyTier||'USER';
    const centralChanges=!existing||
      displayName!==(existing.displayName||existing.username)||
      pin.length>0||
      enabled!==(existing.enabled!==false);
    if(centralChanges&&state.canManageCentralUsers!==true){
      setStatus('Central account details are controlled by the existing Central Users permission. YARD HUB tier assignment remains separate.','error');return;
    }
    if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)){setStatus('Username must be 2–32 letters, numbers, dots, underscores or hyphens.','error');return}
    if(!displayName||displayName.length>80){setStatus('Enter a display name of up to 80 characters.','error');return}
    if(pin&&(!/^[0-9]{4,8}$/.test(pin))){setStatus('PIN must contain 4–8 digits.','error');return}
    if(!editingUsername&&!pin){setStatus('A PIN is required for a new user.','error');return}
    if(!roles.includes(hubTier)){setStatus('Select a valid YARD HUB tier.','error');return}
    if(!isRootAdmin()&&!editableByAdmin.includes(hubTier)&&(hubTier!==existing?.hubTier)){
      setStatus('ADMIN may assign only MANAGER, SUPERVISOR, USER and SPECTATOR YARD HUB tiers.','error');return;
    }
    if(hubTier==='OWNER'&&username.toUpperCase()!=='DEV'){setStatus('DEV is the only OWNER account.','error');return}
    if(hubTier==='DEVACC'&&(!isRootAdmin()||!rootDev())){setStatus('Only root DEV can assign the DEVACC YARD HUB tier.','error');return}
    const userData={username,displayName,tier:downtimeTier,enabled};
    if(pin)userData.pin=pin;
    setBusy(true);setStatus(centralChanges?'SAVING CENTRAL USER…':'SAVING YARD HUB TIER…');
    let centralSaved=false;
    try{
      if(centralChanges){
        const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;
        if(typeof saveCentralUser!=='function')throw new Error('Central user mutation bridge is unavailable. Refresh and try again.');
        const saved=await saveCentralUser(userData);
        state.centralVersion=Number(saved.version||state.centralVersion+1);
        centralSaved=true;
      }
      const assigned=await callApi('save-user-tier',{username,tier:hubTier,version:state.permissionVersion});
      state.permissionVersion=Number(assigned.version||state.permissionVersion+1);
      closeUserModal();
      await loadState();
      setStatus(centralChanges?'CENTRAL USER AND YARD HUB TIER SAVED.':'YARD HUB TIER SAVED. DOWNTIME USER DATA WAS NOT CHANGED.','ok');
    }catch(error){
      const detail=centralSaved||error?.centralUserSaved
        ?'Central account saved, but the YARD HUB tier was not saved or could not be verified. Refresh the user list before retrying. '
        :'';
      setStatus(detail+(error.message||'Unable to save the user account.'),'error');
      try{await loadState()}catch{}
    }finally{setBusy(false)}
  }
  async function setUserEnabled(user,enabled){
    if(saving||!state||state.canManageCentralUsers!==true||String(user.username).toLowerCase()===String(currentUser()?.username||'').toLowerCase())return;
    const action=enabled?'RE-ENABLE':'DISABLE';
    if(!window.confirm(action+' '+user.username+'? This will revoke their current sessions.'))return;
    setBusy(true);setStatus((enabled?'RE-ENABLING ':'DISABLING ')+user.username+'…');
    try{
      const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;
        if(typeof saveCentralUser!=='function')throw new Error('Central user mutation bridge is unavailable. Refresh and try again.');
      const result=await saveCentralUser({
        username:user.username,displayName:user.displayName||user.username,tier:user.legacyTier||'USER',enabled
      });
      state.centralVersion=Number(result.version||state.centralVersion+1);
      await loadState();
      setStatus('ACCOUNT '+(enabled?'RE-ENABLED.':'DISABLED.')+' Existing sessions have been revoked.','ok');
    }catch(error){setStatus(error.message||'Unable to update account status.','error')}
    finally{setBusy(false)}
  }
  function renderTierCards(){
    const host=$('yardHubTierCards');if(!host||!workingPayload)return;
    host.replaceChildren();
    allRoles().forEach(role=>{
      const editable=canEditRole(role);
      const card=element('article','yard-hub-tier-card'+(editable?'':' locked'));
      const heading=element('header','yard-hub-tier-card-head');
      heading.append(element('strong','',roleLabels[role]||role),element('small','',role==='OWNER'?'Root DEV account':role==='DEVACC'?'Root-equivalent account':role==='ADMIN'?'YARD HUB administrator':roles.includes(role)?'Operational account tier':'Custom YARD HUB tier'));
      card.appendChild(heading);
      const table=element('div','yard-hub-permission-table');
      const downtime=element('div','yard-hub-permission-row external');
      downtime.append(element('strong','','DOWNTIME'),element('span','yard-hub-external-tag','MANAGED SEPARATELY IN DOWNTIME · ACCESS & RIGHTS'));
      table.appendChild(downtime);
      sections.forEach(section=>{
        const current=workingPayload.tiers?.[role]?.[section.key]||'NONE';
        const row=element('div','yard-hub-permission-row');
        row.appendChild(element('strong','',section.label));
        const controls=element('div','yard-hub-checks');
        ['READ','INPUT','EDIT'].forEach(mode=>{
          const label=element('label','yard-hub-check-option '+mode.toLowerCase());
          const box=document.createElement('input');box.type='checkbox';box.checked=current===mode;box.disabled=!editable;box.dataset.hubTier=role;box.dataset.hubSection=section.key;box.dataset.hubMode=mode;
          box.addEventListener('change',()=>{
            if(!editable)return;
            workingPayload.tiers[role][section.key]=box.checked?mode:(workingPayload.tiers[role][section.key]===mode?'NONE':workingPayload.tiers[role][section.key]);
            renderTierCards();updateTierSaveState();
          });
          label.append(box,element('span','',mode));controls.appendChild(label);
        });
        row.appendChild(controls);table.appendChild(row);
      });
      if(!editable)card.appendChild(element('div','yard-hub-tier-lock-note','Protected tier · only DEV / DEVACC can change this profile.'));
      card.appendChild(table);host.appendChild(card);
    });
  }
  function addCustomTier(){
    if(!isRootAdmin()||!workingPayload)return;
    const raw=window.prompt('NEW CUSTOM YARD HUB TIER — use 2–24 letters, numbers or underscores.');
    if(raw===null)return;
    const name=raw.trim().toUpperCase().replace(/[ -]+/g,'_');
    if(!/^[A-Z][A-Z0-9_]{1,23}$/.test(name)||roles.includes(name)){setStatus('Tier name invalid or reserved.','error');return}
    if(allRoles().includes(name)){setStatus('That custom tier already exists.','error');return}
    workingPayload.customTiers=[...(workingPayload.customTiers||[]),name];
    workingPayload.tiers[name]={floor:'NONE',checkSheets:'NONE',repairMaintenance:'NONE',repairMaintenanceMachinery:'NONE'};
    renderTierCards();updateTierSaveState();setStatus('CUSTOM TIER ADDED. SAVE PERMISSIONS TO PUBLISH IT.','ok');
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
      state.permissionVersion=Number(result.version||state.permissionVersion+1);
      await loadState();setStatus('YARD HUB TIER PERMISSIONS SAVED.','ok');
    }catch(error){
      setStatus(error.message||'Unable to save YARD HUB permissions.','error');
      if(error.status===409){try{await loadState()}catch{}}
    }finally{setBusy(false);updateTierSaveState()}
  }
  function bind(){
    const button=$('yardHubSettingsBtn');
    if(button){button.hidden=true;button.addEventListener('click',openSettings)}
    $('yardHubSettingsBack')?.addEventListener('click',closeSettings);
    $('yardHubSettingsUsers')?.addEventListener('click',()=>openSettingsView('users'));
    $('yardHubSettingsTiers')?.addEventListener('click',()=>openSettingsView('tiers'));
    document.querySelectorAll('[data-yard-settings-home]').forEach(node=>node.addEventListener('click',showSettingsHome));
    $('yardHubUserAdd')?.addEventListener('click',()=>openUserModal());
    $('yardHubUserCancel')?.addEventListener('click',closeUserModal);
    $('yardHubUserForm')?.addEventListener('submit',saveUser);
    $('yardHubUserStatus')?.addEventListener('click',()=>{
      const user=state?.users?.find(item=>item.username===editingUsername);
      if(user)setUserEnabled(user,user.enabled===false).then(()=>closeUserModal());
    });
    $('yardHubTierSave')?.addEventListener('click',saveTierSettings);
    $('yardHubCustomTierAdd')?.addEventListener('click',addCustomTier);
    $('yardHubTierReset')?.addEventListener('click',()=>{
      if(!state||!hasUnsavedTierChanges())return;
      if(!window.confirm('Discard unsaved permission changes?'))return;
      workingPayload=JSON.parse(JSON.stringify(state.tierPermissions));
      renderTierCards();updateTierSaveState();setStatus('');
    });
    $('yardHubUserModal')?.addEventListener('click',event=>{if(event.target===$('yardHubUserModal'))closeUserModal()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('yardHubUserModal')?.hidden)closeUserModal()});
    window.addEventListener('yard-hub:shown',()=>configureButton().catch(()=>{}));
    configureButton().catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();