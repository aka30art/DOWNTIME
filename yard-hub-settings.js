(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const API=()=>window.YARD_HUB_SETTINGS_API||'';
  const roles=['OWNER','DEVACC','ADMIN','MANAGER','SUPERVISOR','MECHANIC','USER','SPECTATOR'];
  const editableByAdmin=['MANAGER','SUPERVISOR','MECHANIC','USER','SPECTATOR'];
  const roleLabels={OWNER:'OWNER · ROOT',DEVACC:'DEVACC',ADMIN:'ADMIN',MANAGER:'MANAGER',SUPERVISOR:'SUPERVISOR',MECHANIC:'MECHANIC',USER:'USER',SPECTATOR:'SPECTATOR'};
  const sections=[{key:'floor',label:'STAFF MANAGEMENT'},{key:'checkSheets',label:'DAILY'},{key:'repairMaintenance',label:'REPAIRS & MAINTENANCE'},{key:'repairMaintenanceMachinery',label:'R&M MACHINERY'}];
  const modes=['NONE','READ','INPUT','EDIT'];
  const yardDepartments=['SCPL','R&M','Management','SCFL','Traffic'];
  const yardPermissionFields=[{key:'can_view',label:'VIEW'},{key:'can_enter',label:'ENTER'},{key:'can_edit',label:'EDIT'},{key:'can_manage',label:'MANAGE'}];
  const staffDepartmentRules={SCPL:{roles:['Main Operator','Picking Line Crew']},'R&M':{role:'Mechanic'},Management:{role:'Manager'},SCFL:{role:'Floor Crew'},Traffic:{role:'Gateman'}};
  const allRoles=()=>[...roles.filter(role=>!(workingPayload?.retiredTiers||[]).includes(role)),...(Array.isArray(workingPayload?.customTiers)?workingPayload.customTiers:[])];
  let state=null,workingPayload=null,editingUsername=null,saving=false,myHubTier=null,myCanManageSettings=false,accessRefresh=null;
  let editingYardRoleId=null,editingYardRoleVersion=0,workingYardRolePermissions=[],yardRoleOriginal=null,myRootsAuthority=null,rootsState=null;

  function currentSession(){return window.DowntimeCentral?.session||null}
  function currentUser(){return currentSession()?.user||null}
  function legacyTier(){return String(currentUser()?.tier||'USER').toUpperCase()}
  function rootAuthority(){return state?.rootsAuthority||myRootsAuthority||null}
  function rootDev(){return rootAuthority()==='DEV'}
  function isProtectedRoot(){return ['DEV','DEV1','ADMIN'].includes(rootAuthority())}
  function isRootAdmin(){return rootDev()||myHubTier==='DEVACC'}
  function isSettingsAdmin(){return isProtectedRoot()}
  function syncStaffRoleOptions(){
    const department=$('yardHubStaffDepartment')?.value||'SCPL',select=$('yardHubStaffRole');
    if(!select)return;
    const rule=staffDepartmentRules[department],values=rule?.roles||[rule?.role].filter(Boolean);
    select.replaceChildren();
    values.forEach(value=>{const option=element('option','',value);option.value=value;select.appendChild(option)});
    const station=$('yardHubStaffStation'),locked=$('yardHubStaffStationLocked');
    if(station){station.disabled=department!=='SCPL';if(department!=='SCPL')station.value=''}
    if(locked){locked.disabled=department!=='SCPL';if(department!=='SCPL')locked.checked=false}
  }
  function populateYardRoles(selectedId=''){
    const select=$('yardHubUserYardRole');if(!select)return false;
    select.replaceChildren();
    const roles=Array.isArray(state?.yardRoles)?state.yardRoles:[];
    if(!roles.length){const option=element('option','','NO ACTIVE YARD ROLES CONFIGURED');option.value='';option.disabled=true;select.appendChild(option);select.value='';return false}
    const placeholder=element('option','','SELECT A YARD ROLE');placeholder.value='';placeholder.disabled=true;select.appendChild(placeholder);
    roles.forEach(role=>{const option=element('option','',role.name);option.value=role.id;select.appendChild(option)});
    select.value=roles.some(role=>role.id===selectedId)?selectedId:'';
    return true;
  }
  function setStatus(message,type=''){
    const node=$('yardHubSettingsStatus');
    if(!node)return;
    node.textContent=message||'';
    node.dataset.state=type;
  }
  function setBusy(value){
    saving=value;
    ['yardHubUserSave','yardHubUserStatus','yardHubTierSave','yardHubRoleSave','yardHubRoleAdd'].forEach(id=>{const b=$(id);if(b)b.disabled=value});
    const addUser=$('yardHubUserAdd');
    if(addUser)addUser.disabled=value||state?.canManageCentralUsers!==true||!rootDev()||!(state?.yardRoles||[]).length;
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
      myRootsAuthority=result.rootsAuthority||null;
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
    myRootsAuthority=result.rootsAuthority||myRootsAuthority||null;
    myCanManageSettings=result.canManageYardRoles===true||result.canManageRoots===true;
    workingPayload=JSON.parse(JSON.stringify(result.tierPermissions));
    renderUsers();renderTierCards();renderYardRoleCards();updateTierSaveState();
    const addUser=$('yardHubUserAdd');
    if(addUser)addUser.disabled=saving||result.canManageCentralUsers!==true||!rootDev()||!(result.yardRoles||[]).length;
    const addRole=$('yardHubRoleAdd');if(addRole)addRole.hidden!==undefined&&(addRole.hidden=!isProtectedRoot());
    const roleHome=$('yardHubSettingsRoles');if(roleHome)roleHome.hidden=!isProtectedRoot();
    const rootsHome=$('yardHubSettingsRoots');if(rootsHome)rootsHome.hidden=!rootDev();
    const addTier=$('yardHubCustomTierAdd');
    if(addTier)addTier.hidden=!isRootAdmin();
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
    $('yardHubRolesView').hidden=true;
    $('yardHubRootsView').hidden=true;
    $('yardHubTiersView').hidden=true;
    $('yardHubUserModal').hidden=true;
    $('yardHubRoleModal').hidden=true;
    $('yardHubSettingsTitle').textContent='YARD HUB SETTINGS';
    setStatus('');
  }
  function openSettingsView(view){
    $('yardHubSettingsHome').hidden=true;
    $('yardHubUsersView').hidden=view!=='users';
    $('yardHubRolesView').hidden=view!=='roles';
    $('yardHubRootsView').hidden=view!=='roots';
    $('yardHubTiersView').hidden=view!=='tiers';
    $('yardHubUserModal').hidden=true;
    $('yardHubRoleModal').hidden=true;
    $('yardHubSettingsTitle').textContent=view==='users'?'USERS':view==='roles'?'YARD ROLES':view==='roots'?'PROTECTED ROOTS':'TIERS';
    setStatus('');
    if(view==='users')renderUsers();
    if(view==='tiers')renderTierCards();
    if(view==='roles')renderYardRoleCards();
    if(view==='roots')loadRootsState().catch(error=>setStatus(error.message||'Unable to load ROOTS directory.','error'));
  }
  async function openSettings(){
    setStatus('VERIFYING SETTINGS ACCESS…');
    try{
      const access=await configureButton();
      if(!access?.canManageSettings||!isSettingsAdmin())throw new Error('YARD HUB Access and Rights is restricted to protected ROOTS identities.');
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
    if(['OWNER','DEVACC'].includes(role))return false;
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
    return String(user.username||'').toUpperCase()==='DEV'||Boolean(user.rootsClass);
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
      meta.appendChild(element('span','yard-hub-tier-tag',user.yardRoleId?'YARD ROLE · '+((state.yardRoles||[]).find(role=>role.id===user.yardRoleId)?.name||'ASSIGNED'):'LEGACY YARD HUB · '+(user.hubTier||'USER')));
      meta.appendChild(element('span','yard-hub-legacy-tag','DOWNTIME · '+(user.legacyTier||'NO LEGACY TIER')));
      meta.appendChild(element('span',user.provisioningState==='YARD_ROLE_PENDING'?'yard-hub-status off':user.enabled===false?'yard-hub-status off':'yard-hub-status',user.provisioningState==='YARD_ROLE_PENDING'?'PENDING SETUP':user.enabled===false?'DISABLED':'ACTIVE'));
      const actions=element('div','yard-hub-user-actions');
      const protectedUser=userIsProtected(user)&&!rootDev();
      const isSelf=String(user.username).toLowerCase()===me;
      const edit=element('button','yard-hub-small-button','EDIT');
      edit.type='button';edit.disabled=saving||isSelf||protectedUser;
      edit.title=isSelf?'Use a different administrator account to edit this account.':protectedUser?'Protected tier account.':'Edit user';
      edit.addEventListener('click',()=>openUserModal(user));
      actions.appendChild(edit);
      const status=element('button','yard-hub-small-button '+(user.enabled===false?'':'danger'),user.provisioningState==='YARD_ROLE_PENDING'?'COMPLETE SETUP':user.enabled===false?'RE-ENABLE':'DISABLE');
      status.type='button';status.disabled=saving||state.canManageCentralUsers!==true||isSelf||protectedUser||(String(user.username).toUpperCase()==='DEV');
      status.addEventListener('click',()=>setUserEnabled(user,user.enabled===false));
      actions.appendChild(status);
      row.append(identity,meta,actions);
      if(isProtectedRoot()&&user.userId&&user.staffId&&!user.rootsClass&&user.enabled!==false&&user.provisioningState!=='YARD_ROLE_PENDING'){
        const assign=element('div','yard-hub-user-role-assignment');
        const select=document.createElement('select');select.setAttribute('aria-label','YARD ROLE for '+user.username);
        (state.yardRoles||[]).forEach(role=>{const option=element('option','',role.name);option.value=role.id;select.appendChild(option)});
        select.value=(state.yardRoles||[]).some(role=>role.id===user.yardRoleId)?user.yardRoleId:(state.yardRoles?.[0]?.id||'');
        select.disabled=saving||!(state.yardRoles||[]).length;
        const assignButton=element('button','yard-hub-small-button',user.yardRoleId?'ASSIGN / CHANGE ROLE':'ASSIGN YARD ROLE');
        assignButton.type='button';assignButton.disabled=saving||!select.value;
        assignButton.addEventListener('click',async()=>{
          if(!select.value)return;
          setBusy(true);setStatus('ASSIGNING YARD ROLE…');
          try{await callApi('assign-user-role',{userId:user.userId,yardRoleId:select.value,assignmentVersion:Number(user.yardRoleVersion||0)||undefined});await loadState();setStatus('YARD ROLE ASSIGNED.','ok')}
          catch(error){setStatus(error.message||'Unable to assign YARD ROLE.','error')}
          finally{setBusy(false)}
        });
        assign.append(select,assignButton);row.appendChild(assign);
      }
      host.appendChild(row);
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
    const isPending=user?.provisioningState==='YARD_ROLE_PENDING';
    const isCanonical=Boolean(user?.yardRoleId);
    if(!user&&!rootDev()){setStatus('Only immutable DEV may create new USER identities.','error');return}
    if(user&&!canManageCentralUsers){setStatus('Your account cannot manage Central USER records.','error');return}
    editingUsername=user?String(user.username):null;
    $('yardHubUserForm').reset();
    $('yardHubStaffFields').hidden=!!user;
    $('yardHubLegacyTierField').hidden=!user||isPending||isCanonical;
    $('yardHubUserYardRoleField').hidden=!!user&&!isPending&&!(user.userId&&user.staffId);
    $('yardHubStaffDepartment').value='SCPL';syncStaffRoleOptions();
    $('yardHubStaffRole').value='Main Operator';$('yardHubStaffStation').value='';
    $('yardHubStaffStationLocked').checked=false;$('yardHubStaffOnSite').checked=true;
    const hasRoles=populateYardRoles(user?.requestedYardRoleId||user?.yardRoleId||'');
    $('yardHubUserYardRole').disabled=isPending||!rootDev();
    $('yardHubUserModal').hidden=false;
    $('yardHubUserModalTitle').textContent=user?'EDIT USER':'ADD USER';
    $('yardHubUserUsername').value=user?.username||'';
    $('yardHubUserUsername').disabled=!!user||!canManageCentralUsers;
    $('yardHubUserDisplay').value=user?.displayName||'';
    $('yardHubUserDisplay').disabled=!canManageCentralUsers||isPending;
    $('yardHubUserPin').value='';
    $('yardHubUserPin').required=!user;
    $('yardHubUserPin').disabled=!canManageCentralUsers||isPending;
    $('yardHubUserPin').placeholder=user?'Leave blank to keep current PIN':'4–8 digit PIN';
    $('yardHubUserEnabled').checked=user?.enabled!==false;
    $('yardHubUserEnabled').disabled=!canManageCentralUsers;
    $('yardHubUserDowntimeTier').textContent=user?(user.legacyTier||'NO LEGACY TIER'):'NO LEGACY TIER · NEW IDENTITY';
    $('yardHubUserHubTier').replaceChildren();
    allowedHubTiers(user?.hubTier,user?.username||'').forEach(role=>{
      const option=element('option','',roleLabels[role]||role);option.value=role;
      $('yardHubUserHubTier').appendChild(option);
    });
    $('yardHubUserHubTier').value=user?.hubTier||'USER';
    if(isPending)$('yardHubUserYardRole').value=user?.requestedYardRoleId||'';
    $('yardHubUserModalHint').textContent=isPending
      ?'USER + STAFF are saved but inactive. Complete the canonical YARD ROLE assignment, then enable the account.'
      :isCanonical
        ?'Canonical YARD ROLE is the account authority. Legacy YARD HUB tiers are not applied to this identity.'
        :user
          ?'Legacy account settings remain compatibility-only. USER and STAFF history are preserved.'
          :hasRoles
            ?'A new USER receives a linked STAFF profile and one canonical YARD ROLE. No legacy tier is assigned.'
            :'No active canonical YARD ROLE is configured. Account creation remains disabled.';
    $('yardHubUserSave').textContent=user?'SAVE USER':'ADD USER';
    $('yardHubUserSave').disabled=!user&&!hasRoles;
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
    const isNew=!existing;
    const pendingProvisioning=existing?.provisioningState==='YARD_ROLE_PENDING';
    const canonicalIdentity=Boolean(existing?.userId&&existing?.staffId);
    const canonicalLinkedIdentity=canonicalIdentity&&!pendingProvisioning;
    const requestedYardRoleId=String($('yardHubUserYardRole')?.value||existing?.requestedYardRoleId||existing?.yardRoleId||'');
    const yardRoleChanged=canonicalLinkedIdentity&&requestedYardRoleId!==String(existing?.yardRoleId||'');
    const downtimeTier=existing?.legacyTier??null;
    const centralChanges=!pendingProvisioning&&(!existing||
      displayName!==(existing.displayName||existing.username)||
      pin.length>0||
      enabled!==(existing.enabled!==false));
    if(centralChanges&&state.canManageCentralUsers!==true){
      setStatus('Central account details are controlled by the existing Central Users permission. YARD HUB tier assignment remains separate.','error');return;
    }
    if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username)){setStatus('Username must be 2–32 letters, numbers, dots, underscores or hyphens.','error');return}
    if(!displayName||displayName.length>80){setStatus('Enter a display name of up to 80 characters.','error');return}
    if(pin&&(!/^[0-9]{4,8}$/.test(pin))){setStatus('PIN must contain 4–8 digits.','error');return}
    if(!editingUsername&&!pin){setStatus('A PIN is required for a new user.','error');return}
    if(isNew||pendingProvisioning||yardRoleChanged){
      if(!requestedYardRoleId||!(state?.yardRoles||[]).some(role=>role.id===requestedYardRoleId)){setStatus('Select an active canonical YARD ROLE.','error');return}
    }else if(!canonicalIdentity&&!allRoles().includes(hubTier)){setStatus('Select a valid legacy YARD HUB tier.','error');return}
    if(!isRootAdmin()&&!editableByAdmin.includes(hubTier)&&(hubTier!==existing?.hubTier)){
      setStatus('ADMIN may assign only MANAGER, SUPERVISOR, USER and SPECTATOR YARD HUB tiers.','error');return;
    }
    if(hubTier==='OWNER'&&username.toUpperCase()!=='DEV'){setStatus('DEV is the only OWNER account.','error');return}
    if(hubTier==='DEVACC'&&(!isRootAdmin()||!rootDev())){setStatus('Only root DEV can assign the DEVACC YARD HUB tier.','error');return}
    const userData={username,displayName,tier:downtimeTier,enabled};
    if(pin)userData.pin=pin;
    if(isNew){
      userData.requestedYardRoleId=requestedYardRoleId;
      userData.idempotencyKey=crypto.randomUUID();
      userData.staff={
        department:$('yardHubStaffDepartment').value,
        onSiteRole:$('yardHubStaffRole').value,
        station:$('yardHubStaffStation').value.trim(),
        stationLocked:$('yardHubStaffStationLocked').checked,
        onSite:$('yardHubStaffOnSite').checked
      };
    }
    setBusy(true);setStatus(centralChanges?'SAVING CENTRAL USER…':'SAVING YARD HUB TIER…');
    let centralSaved=false;
    let provisionedUserId=existing?.userId||null;
    try{
      if(centralChanges){
        const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;
        if(typeof saveCentralUser!=='function')throw new Error('Central user mutation bridge is unavailable. Refresh and try again.');
        const saved=await saveCentralUser(userData);
        provisionedUserId=saved.userId||provisionedUserId;
        state.centralVersion=Number(saved.version||state.centralVersion+1);
        centralSaved=true;
      }
      if(isNew||pendingProvisioning){
        if(!/^[0-9a-f-]{36}$/i.test(String(provisionedUserId||'')))throw new Error('Provisioned immutable USER ID is missing. The account remains inactive.');
        await callApi('assign-user-role',{userId:provisionedUserId,yardRoleId:requestedYardRoleId});
        if(enabled){
          const activate=window.activateDowntimeCentralUserFromYardHub;
          if(typeof activate!=='function')throw new Error('USER activation bridge is unavailable. The account remains inactive.');
          const activated=await activate(provisionedUserId);
          state.centralVersion=Number(activated.version||state.centralVersion+1);
        }
      }else if(canonicalLinkedIdentity&&yardRoleChanged){
        await callApi('assign-user-role',{userId:existing.userId,yardRoleId:requestedYardRoleId,assignmentVersion:existing.yardRoleVersion});
      }else if(!canonicalIdentity){
        const assigned=await callApi('save-user-tier',{username,tier:hubTier,version:state.permissionVersion});
        state.permissionVersion=Number(assigned.version||state.permissionVersion+1);
      }
      closeUserModal();
      await loadState();
      setStatus((isNew||pendingProvisioning)&&!enabled
        ?'USER + STAFF SAVED WITH A PENDING YARD ROLE. ACCOUNT REMAINS INACTIVE.'
        :(isNew||pendingProvisioning)?'USER, STAFF AND CANONICAL YARD ROLE PROVISIONED.'
        :yardRoleChanged?'CANONICAL YARD ROLE REASSIGNED.':canonicalIdentity?'CANONICAL USER AND LINKED STAFF DETAILS SAVED.':'LEGACY USER AND YARD HUB SETTINGS SAVED.','ok');
    }catch(error){
      const detail=centralSaved||error?.centralUserSaved
        ?'Central USER + STAFF record was saved, but canonical YARD ROLE assignment or activation did not complete. The account remains inactive. Refresh the user list before retrying. '
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
      if(user.provisioningState==='YARD_ROLE_PENDING'&&enabled){
        if(!user.requestedYardRoleId)throw new Error('The pending USER has no requested canonical YARD ROLE.');
        if(!/^[0-9a-f-]{36}$/i.test(String(user.userId||'')))throw new Error('Pending USER has no immutable USER ID.');
        await callApi('assign-user-role',{userId:user.userId,yardRoleId:user.requestedYardRoleId});
        const activate=window.activateDowntimeCentralUserFromYardHub;
        if(typeof activate!=='function')throw new Error('USER activation bridge is unavailable.');
        const result=await activate(user.userId);
        state.centralVersion=Number(result.version||state.centralVersion+1);
      }else{
        const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;
        if(typeof saveCentralUser!=='function')throw new Error('Central user mutation bridge is unavailable. Refresh and try again.');
        const result=await saveCentralUser({
          username:user.username,displayName:user.displayName||user.username,tier:user.legacyTier??null,enabled
        });
        state.centralVersion=Number(result.version||state.centralVersion+1);
      }
      await loadState();
      setStatus('ACCOUNT '+(enabled?'RE-ENABLED.':'DISABLED.')+' Existing sessions have been revoked.','ok');
    }catch(error){setStatus(error.message||'Unable to update account status.','error')}
    finally{setBusy(false)}
  }
  async function loadRootsState(){
    if(!rootDev())throw new Error('The protected ROOTS directory is restricted to DEV.');
    const result=await callApi('roots-state');rootsState=result;
    const select=$('yardHubRootUser'),previous=select.value;
    select.replaceChildren();
    const placeholder=element('option','','SELECT CANONICAL USER');placeholder.value='';select.appendChild(placeholder);
    (result.eligibleUsers||[]).forEach(user=>{
      const option=element('option','',user.displayName+' · '+user.username);option.value=user.userId+'|'+user.staffId;select.appendChild(option);
    });
    if([...select.options].some(option=>option.value===previous))select.value=previous;
    const host=$('yardHubRootAssignments');host.replaceChildren();
    const assignments=Array.isArray(result.assignments)?result.assignments:[];
    if(!assignments.length){host.appendChild(element('p','yard-hub-empty','No DEV1 or ADMIN identities are assigned.'));return result}
    assignments.forEach(item=>{
      const card=element('article','yard-hub-root-card');
      const identity=element('div','yard-hub-root-identity');
      identity.append(element('strong','',item.displayName),element('small','',item.username+' · '+item.rootsClass+' · '+item.status));
      card.appendChild(identity);
      const actions=element('div','yard-hub-root-actions');
      const classification=document.createElement('select');classification.setAttribute('aria-label','ROOTS classification for '+item.username);
      ['DEV1','ADMIN'].forEach(value=>{const option=element('option','',value);option.value=value;classification.appendChild(option)});
      classification.value=item.rootsClass;
      const active=item.status==='ACTIVE';
      if(active){
        const change=element('button','yard-hub-small-button','RECLASSIFY');change.type='button';
        change.disabled=saving||classification.value===item.rootsClass;
        classification.addEventListener('change',()=>{change.disabled=saving||classification.value===item.rootsClass});
        change.addEventListener('click',()=>manageRoot(item,'RECLASSIFY',classification.value));
        const revoke=element('button','yard-hub-small-button danger','REVOKE');revoke.type='button';revoke.disabled=saving;
        revoke.addEventListener('click',()=>{if(window.confirm('Revoke protected ROOTS authority for '+item.username+'?'))manageRoot(item,'REVOKE',item.rootsClass)});
        actions.append(classification,change,revoke);
      }else{
        const restore=element('button','yard-hub-small-button','RESTORE');restore.type='button';restore.disabled=saving;
        restore.addEventListener('click',()=>manageRoot(item,'ASSIGN',classification.value));
        actions.append(classification,restore);
      }
      card.append(identity,actions);host.appendChild(card);
    });
    return result;
  }
  async function assignSelectedRoot(){
    const value=$('yardHubRootUser')?.value||'';
    const [userId,staffId]=value.split('|');
    if(!userId||!staffId){setStatus('Select an active canonical USER/STAFF identity.','error');return}
    await manageRoot({userId,staffId,version:null},'ASSIGN',$('yardHubRootClass').value);
  }
  async function manageRoot(item,lifecycleAction,rootsClass){
    if(!rootDev()||saving)return;
    setBusy(true);setStatus('UPDATING PROTECTED ROOTS…');
    try{
      await callApi('roots-manage',{userId:item.userId,staffId:item.staffId,lifecycleAction,rootsClass,version:item.version||undefined});
      await loadRootsState();await loadState();
      setStatus('PROTECTED ROOTS ASSIGNMENT UPDATED.','ok');
    }catch(error){setStatus(error.message||'ROOTS operation failed.','error')}
    finally{setBusy(false)}
  }
  function renderYardRoleCards(){
    const host=$('yardHubRoleCards');if(!host||!state)return;
    host.replaceChildren();
    const catalogue=Array.isArray(state.roleCatalogue)?state.roleCatalogue:[];
    if(!catalogue.length){host.appendChild(element('p','yard-hub-empty','No YARD ROLES have been created. Create the first role and configure its five-department permission matrix.'));return}
    catalogue.forEach(role=>{
      const card=element('article','yard-hub-role-card');
      const head=element('header','yard-hub-role-card-head');
      const identity=element('div','');
      identity.append(element('strong','',role.name),element('small','',role.description||'No description'));
      head.appendChild(identity);
      head.appendChild(element('span','yard-hub-role-status',role.status));
      card.appendChild(head);
      const permissions=Array.isArray(role.permissions)?role.permissions:[];
      const summary=permissions.map(row=>row.department+': '+yardPermissionFields.filter(field=>row[field.key]===true).map(field=>field.label).join(', ')).join(' · ');
      card.appendChild(element('p','',summary||'No permissions configured'));
      const actions=element('div','yard-hub-role-actions');
      const edit=element('button','yard-hub-secondary','EDIT ROLE');edit.type='button';edit.disabled=!isProtectedRoot()||saving;
      edit.addEventListener('click',()=>openYardRoleModal(role));
      actions.appendChild(edit);card.appendChild(actions);host.appendChild(card);
    });
  }
  function renderYardRolePermissionControls(){
    const host=$('yardHubRolePermissions');if(!host)return;
    host.replaceChildren();
    yardDepartments.forEach(department=>{
      const current=workingYardRolePermissions.find(row=>row.department===department)||{department,can_view:false,can_enter:false,can_edit:false,can_manage:false};
      const row=element('div','yard-hub-role-permission-row');
      row.appendChild(element('strong','',department));
      yardPermissionFields.forEach(field=>{
        const label=element('label','yard-hub-role-check');
        const box=document.createElement('input');box.type='checkbox';box.checked=current[field.key]===true;box.dataset.department=department;box.dataset.permission=field.key;
        box.addEventListener('change',()=>{
          const target=workingYardRolePermissions.find(item=>item.department===department);
          if(target)target[field.key]=box.checked;
        });
        label.append(box,element('span','',field.label));row.appendChild(label);
      });
      host.appendChild(row);
    });
  }
  function openYardRoleModal(role=null){
    if(!isProtectedRoot()||saving)return;
    editingYardRoleId=role?.id||null;editingYardRoleVersion=Number(role?.version||0);
    $('yardHubRoleName').value=role?.name||'';
    $('yardHubRoleDescription').value=role?.description||'';
    $('yardHubRoleStatus').value=role?.status||'DRAFT';
    workingYardRolePermissions=yardDepartments.map(department=>{
      const row=(role?.permissions||[]).find(item=>item.department===department)||{};
      return {department,can_view:row.can_view===true,can_enter:row.can_enter===true,can_edit:row.can_edit===true,can_manage:row.can_manage===true};
    });
    yardRoleOriginal=JSON.stringify({name:role?.name||'',description:role?.description||'',status:role?.status||'DRAFT',permissions:workingYardRolePermissions});
    $('yardHubRoleModalTitle').textContent=role?'EDIT YARD ROLE':'CREATE YARD ROLE';
    $('yardHubRoleSave').disabled=false;
    renderYardRolePermissionControls();
    $('yardHubRoleModal').hidden=false;
    $('yardHubRoleName').focus();
  }
  function closeYardRoleModal(){
    const modal=$('yardHubRoleModal');if(!modal||modal.hidden)return;
    const current=JSON.stringify({name:$('yardHubRoleName').value.trim(),description:$('yardHubRoleDescription').value.trim(),status:$('yardHubRoleStatus').value,permissions:workingYardRolePermissions});
    if(current!==yardRoleOriginal&&!window.confirm('Discard unsaved YARD ROLE changes?'))return;
    modal.hidden=true;editingYardRoleId=null;editingYardRoleVersion=0;workingYardRolePermissions=[];yardRoleOriginal=null;
  }
  async function saveYardRole(event){
    event?.preventDefault();
    if(saving||!isProtectedRoot())return;
    const name=String($('yardHubRoleName').value||'').trim(),description=String($('yardHubRoleDescription').value||'').trim(),status=String($('yardHubRoleStatus').value||'DRAFT');
    if(!name||name.length>80||description.length>500){setStatus('Enter a valid YARD ROLE name and description.','error');return}
    if(workingYardRolePermissions.length!==5||yardDepartments.some(department=>!workingYardRolePermissions.some(row=>row.department===department))){setStatus('All five departments require a permission record.','error');return}
    setBusy(true);setStatus('SAVING YARD ROLE…');
    try{
      await callApi('yard-role-save',{roleId:editingYardRoleId||undefined,version:editingYardRoleVersion,name,description,status,permissions:workingYardRolePermissions});
      await loadState();
      $('yardHubRoleModal').hidden=true;editingYardRoleId=null;editingYardRoleVersion=0;workingYardRolePermissions=[];yardRoleOriginal=null;
      setStatus('YARD ROLE SAVED.','ok');
    }catch(error){
      setStatus(error.message||'Unable to save YARD ROLE.','error');
      if(error.status===409){try{await loadState()}catch{}}
    }finally{setBusy(false)}
  }
  function renderTierCards(){
    const host=$('yardHubTierCards');if(!host||!workingPayload)return;
    host.replaceChildren();
    allRoles().forEach(role=>{
      const editable=canEditRole(role);
      const card=element('article','yard-hub-tier-card'+(editable?'':' locked'));
      const heading=element('header','yard-hub-tier-card-head');
      heading.append(element('strong','',roleLabels[role]||role),element('small','',role==='OWNER'?'Root DEV account':role==='DEVACC'?'Root-equivalent account':role==='ADMIN'?'YARD HUB administrator':roles.includes(role)?'Operational account tier':'Custom YARD HUB tier'));
      if(!['OWNER','DEVACC'].includes(role)&&isRootAdmin()){
        const remove=element('button','yard-hub-small-button danger','DELETE TIER');remove.type='button';
        remove.addEventListener('click',()=>deleteTier(role));heading.appendChild(remove);
      }
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
      if(!editable)card.appendChild(element('div','yard-hub-tier-lock-note','Protected tier · DEV and DEVACC system profiles cannot be changed.'));
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
  function deleteTier(role){
    if(!isRootAdmin()||['OWNER','DEVACC'].includes(role)||!allRoles().includes(role))return;
    const assigned=Object.entries(state?.userTiers||{}).filter(([,tier])=>String(tier).toUpperCase()===role).length;
    if(assigned){setStatus('REASSIGN '+assigned+' USER(S) BEFORE DELETING '+role+'.','error');return}
    if(!window.confirm('Delete '+role+' tier? Its permission profile will be removed when you save.'))return;
    if(roles.includes(role))workingPayload.retiredTiers=[...(workingPayload.retiredTiers||[]),role];
    else workingPayload.customTiers=(workingPayload.customTiers||[]).filter(name=>name!==role);
    delete workingPayload.tiers[role];
    renderTierCards();updateTierSaveState();setStatus(role+' TIER REMOVED. SAVE PERMISSIONS TO CONFIRM DELETION.','ok');
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
    $('yardHubSettingsRoles')?.addEventListener('click',()=>openSettingsView('roles'));
    $('yardHubSettingsRoots')?.addEventListener('click',()=>openSettingsView('roots'));
    $('yardHubRootAssign')?.addEventListener('click',assignSelectedRoot);
    $('yardHubRoleAdd')?.addEventListener('click',()=>openYardRoleModal());
    $('yardHubRoleCancel')?.addEventListener('click',closeYardRoleModal);
    $('yardHubRoleForm')?.addEventListener('submit',saveYardRole);
    $('yardHubRoleModal')?.addEventListener('click',event=>{if(event.target===$('yardHubRoleModal'))closeYardRoleModal()});
    document.querySelectorAll('[data-yard-settings-home]').forEach(node=>node.addEventListener('click',showSettingsHome));
    $('yardHubUserAdd')?.addEventListener('click',()=>openUserModal());
    $('yardHubUserCancel')?.addEventListener('click',closeUserModal);
    $('yardHubUserForm')?.addEventListener('submit',saveUser);
    $('yardHubStaffDepartment')?.addEventListener('change',syncStaffRoleOptions);
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
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('yardHubUserModal')?.hidden)closeUserModal();if(event.key==='Escape'&&!$('yardHubRoleModal')?.hidden)closeYardRoleModal()});
    window.addEventListener('yard-hub:shown',()=>configureButton().catch(()=>{}));
    configureButton().catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();