(()=> {
  'use strict';
  const $=id=>document.getElementById(id);
  const API=()=>window.YARD_HUB_STAFF_API||'';
  let screen=null, state=null, loading=null, modal=null, activeTab='people', noticeTimer=null;

  function session(){return window.DowntimeCentral?.session||null}
  async function callApi(action,payload={}){
    const active=session();
    if(!active?.token)throw new Error('Your YARD HUB session has expired. Sign in again.');
    if(!API())throw new Error('STAFF MANAGEMENT API is not configured.');
    const headers={'Content-Type':'application/json'};
    const key=String(window.DOWNTIME_CENTRAL_API_KEY||'').trim();
    if(key)headers.apikey=key;
    headers['x-downtime-session']=active.token;
    const response=await fetch(API(),{method:'POST',headers,body:JSON.stringify({action,...payload})});
    let result={};try{result=await response.json()}catch{}
    if(!response.ok){const error=new Error(result.error||'STAFF MANAGEMENT request failed.');error.status=response.status;throw error}
    return result;
  }
  function node(tag,className,text){
    const value=document.createElement(tag);
    if(className)value.className=className;
    if(text!==undefined&&text!==null)value.textContent=String(text);
    return value;
  }
  function button(label,kind='secondary',handler){
    const value=node('button','yard-staff-button '+kind,label);
    value.type='button';if(handler)value.addEventListener('click',handler);return value;
  }
  function showNotice(message,type=''){
    const host=$('yardStaffNotice');if(!host)return;
    host.textContent=message||'';host.dataset.state=type;
    if(noticeTimer)clearTimeout(noticeTimer);
    if(message)noticeTimer=setTimeout(()=>{if(host.textContent===message)host.textContent=''},6500);
  }
  function mode(){return state?.permissionMode||'NONE'}
  function canInput(){return ['INPUT','EDIT'].includes(mode())}
  function canEdit(){return mode()==='EDIT'}
  function canManageAccounts(){return state?.canManageAccounts===true}
  function ensure(){
    if(screen)return screen;
    const host=document.querySelector('#yardHub .yard-hub-inner');if(!host)return null;
    screen=node('section','yard-staff-screen');
    screen.id='yardHubStaffScreen';screen.hidden=true;screen.setAttribute('role','main');screen.setAttribute('aria-label','STAFF MANAGEMENT');screen.tabIndex=-1;
    screen.innerHTML=`
      <header class="yard-staff-header">
        <button id="yardStaffBack" class="yard-hub-back" type="button">‹ BACK TO YARD HUB</button>
        <div class="yard-staff-eyebrow">YARD OPERATIONS CORE · WORKFORCE CONTROL</div>
        <h1>STAFF MANAGEMENT</h1>
        <p>Personnel directory · companies and agencies · yard roles · linked YARD HUB accounts</p>
      </header>
      <div id="yardStaffNotice" class="yard-staff-notice" role="status" aria-live="polite"></div>
      <div class="yard-staff-kpis" id="yardStaffKpis"></div>
      <nav class="yard-staff-tabs" aria-label="Staff management sections">
        <button type="button" data-staff-tab="people" class="active">STAFF DIRECTORY</button>
        <button type="button" data-staff-tab="companies">COMPANIES &amp; AGENCIES</button>
        <button type="button" data-staff-tab="roles">YARD ROLES</button>
        <button type="button" data-staff-tab="audit">AUDIT HISTORY</button>
      </nav>
      <section id="yardStaffContent" class="yard-staff-content"></section>
      <div id="yardStaffModalHost"></div>`;
    host.appendChild(screen);
    $('yardStaffBack').addEventListener('click',close);
    screen.querySelectorAll('[data-staff-tab]').forEach(tab=>tab.addEventListener('click',()=>openTab(tab.dataset.staffTab)));
    return screen;
  }
  function setHubVisible(visible){
    const hub=$('yardHub');if(!hub)return;
    ['.yard-hero','.yard-grid','.yard-modules-heading','.yard-hub-footer'].forEach(selector=>{
      const item=hub.querySelector(selector);if(item)item.hidden=!visible;
    });
    const settings=$('yardHubSettingsScreen');if(settings&&visible===false)settings.hidden=true;
  }
  function closeModal(){
    const host=$('yardStaffModalHost');if(host)host.replaceChildren();
    modal=null;
  }
  function close(){
    closeModal();
    if(screen)screen.hidden=true;
    setHubVisible(true);
    window.scrollTo({top:0,behavior:'instant'});
    window.dispatchEvent(new Event('yard-hub:shown'));
  }
  async function open(){
    if(!session()?.token){showNotice('Sign in to YARD HUB first.','error');return}
    ensure();if(!screen)return;
    setHubVisible(false);screen.hidden=false;activeTab='people';
    window.scrollTo({top:0,behavior:'instant'});
    try{
      await loadState();
      requestAnimationFrame(()=>screen.focus({preventScroll:true}));
    }catch{
      // loadState already exposes a user-facing error; avoid an unhandled click promise.
    }
  }
  async function loadState(){
    if(loading)return loading;
    showNotice('LOADING STAFF DIRECTORY…');
    loading=callApi('state').then(result=>{
      state=result;renderKpis();renderTab();showNotice('');renderPermissionNotice();
      return result;
    }).catch(error=>{
      showNotice(error.message||'Unable to load STAFF MANAGEMENT.','error');throw error;
    }).finally(()=>{loading=null});
    return loading;
  }
  function renderPermissionNotice(){
    const content=$('yardStaffContent');if(!content)return;
    if(mode()==='READ')showNotice('READ ONLY · You can view staff, companies, roles and audit history.','');
    else if(mode()==='INPUT')showNotice('INPUT ACCESS · You can add new STAFF-only records. Existing records and configuration are read-only.','');
    else if(mode()==='EDIT')showNotice('EDIT ACCESS · Full staff directory and configuration management.','');
  }
  function renderKpis(){
    const host=$('yardStaffKpis');if(!host||!state)return;
    host.replaceChildren();
    const people=(state.people||[]).filter(item=>!item.archived_at);
    const active=people.filter(item=>item.employment_status==='ACTIVE');
    const userCount=active.filter(item=>item.staff_type==='USER').length;
    const staffCount=active.filter(item=>item.staff_type==='STAFF').length;
    const companyCount=(state.companies||[]).filter(item=>item.is_active&&!item.archived_at).length;
    [
      ['ACTIVE PEOPLE',active.length],
      ['USER ACCOUNTS',userCount],
      ['STAFF · NO ACCOUNT',staffCount],
      ['COMPANIES / AGENCIES',companyCount]
    ].forEach(([label,value])=>{
      const card=node('div','yard-staff-kpi');
      card.append(node('strong','',value),node('span','',label));host.appendChild(card);
    });
  }
  function openTab(tab){
    if(!['people','companies','roles','audit'].includes(tab))return;
    activeTab=tab;
    screen.querySelectorAll('[data-staff-tab]').forEach(item=>item.classList.toggle('active',item.dataset.staffTab===tab));
    renderTab();
  }
  function renderTab(){
    if(!screen||!state)return;
    const host=$('yardStaffContent');if(!host)return;
    host.replaceChildren();
    if(activeTab==='people')renderPeople(host);
    if(activeTab==='companies')renderCompanies(host);
    if(activeTab==='roles')renderRoles(host);
    if(activeTab==='audit')renderAudit(host);
  }
  const byId=(items,id)=>items?.find(item=>item.id===id)||null;
  function activeAssignments(personId){
    return (state?.roleAssignments||[]).filter(item=>item.person_id===personId&&!item.ended_at);
  }
  function roleNames(personId){
    return activeAssignments(personId).map(assignment=>{
      const role=byId(state?.roles,assignment.role_id);
      return role?{name:role.name,primary:assignment.is_primary===true}:null;
    }).filter(Boolean).sort((a,b)=>Number(b.primary)-Number(a.primary)||a.name.localeCompare(b.name));
  }
  function createTag(text,className=''){
    return node('span','yard-staff-tag '+className,text);
  }
  function renderPeople(host){
    const toolbar=node('div','yard-staff-toolbar');
    const title=node('div','yard-staff-section-title');
    title.append(node('h2','', 'STAFF DIRECTORY'),node('p','', 'One personnel record per person. Login access is linked from the existing YARD HUB account directory.'));
    toolbar.appendChild(title);
    const actions=node('div','yard-staff-actions');
    if(canInput())actions.appendChild(button('＋ ADD PERSON','primary',()=>openPersonModal(null)));
    actions.appendChild(button('↻ REFRESH','secondary',()=>loadState().catch(()=>{})));
    toolbar.appendChild(actions);host.appendChild(toolbar);

    const filters=node('div','yard-staff-filters');
    const search=node('input','yard-staff-search');search.type='search';search.placeholder='Search name, Staff ID, company or account…';search.setAttribute('aria-label','Search staff');
    const typeFilter=node('select','yard-staff-filter');typeFilter.setAttribute('aria-label','Filter by USER or STAFF');
    [['','ALL CLASSIFICATIONS'],['USER','USER'],['STAFF','STAFF · NO ACCOUNT']].forEach(([value,label])=>{const option=node('option','',label);option.value=value;typeFilter.appendChild(option)});
    const statusFilter=node('select','yard-staff-filter');statusFilter.setAttribute('aria-label','Filter by employment status');
    [['ACTIVE','ACTIVE'],['INACTIVE','INACTIVE'],['LEFT','LEFT'],['ALL','ALL STATUSES']].forEach(([value,label])=>{const option=node('option','',label);option.value=value;statusFilter.appendChild(option)});
    const archivedLabel=node('label','yard-staff-archive-filter');
    const archivedToggle=node('input');archivedToggle.type='checkbox';
    archivedLabel.append(archivedToggle,node('span','','SHOW ARCHIVED'));
    filters.append(search,typeFilter,statusFilter,archivedLabel);host.appendChild(filters);
    const list=node('div','yard-staff-list');host.appendChild(list);
    const render=()=>{
      const query=search.value.trim().toLowerCase(),type=typeFilter.value,status=statusFilter.value,includeArchived=archivedToggle.checked;
      const rows=(state.people||[]).filter(person=>{
        if(!includeArchived&&person.archived_at)return false;
        if(type&&person.staff_type!==type)return false;
        if(status!=='ALL'&&person.employment_status!==status)return false;
        const company=byId(state.companies,person.company_id)?.name||'';
        const account=person.linked_username||'';
        const roles=roleNames(person.id).map(x=>x.name).join(' ');
        const searchText=[person.full_name,person.display_name,person.staff_number,company,account,roles].join(' ').toLowerCase();
        return !query||searchText.includes(query);
      }).sort((a,b)=>a.full_name.localeCompare(b.full_name));
      list.replaceChildren();
      if(!rows.length){list.appendChild(node('div','yard-staff-empty',includeArchived?'No staff records match these filters.':'No staff records found. Add the first person to begin the directory.'));return}
      rows.forEach(person=>{
        const card=node('article','yard-staff-person-card'+(person.archived_at?' archived':''));
        const left=node('div','yard-staff-person-identity');
        left.append(node('span','yard-staff-code','ST-'+String(person.staff_number).padStart(5,'0')),node('strong','',person.display_name||person.full_name));
        const details=node('div','yard-staff-person-detail');
        const company=byId(state.companies,person.company_id);
        details.append(node('span','',person.full_name),node('span','',company?.name||'NO COMPANY / AGENCY'));
        left.append(details);
        const tags=node('div','yard-staff-tags');
        const typeClass=person.staff_type==='USER'?'user':'staff';
        tags.appendChild(createTag(person.staff_type,typeClass));
        tags.appendChild(createTag(person.employment_status.toLowerCase(),person.employment_status.toLowerCase()));
        if(person.archived_at)tags.appendChild(createTag('ARCHIVED','archived'));
        roleNames(person.id).forEach(role=>tags.appendChild(createTag((role.primary?'PRIMARY · ':'')+role.name,role.primary?'primary':'')));
        if(person.staff_type==='USER'){
          const account=(state.accounts||[]).find(item=>item.username.toLowerCase()===String(person.linked_username||'').toLowerCase());
          tags.appendChild(createTag(account?'ACCOUNT · '+(account.enabled?'ACTIVE':'DISABLED'):'LINKED · DETAILS RESTRICTED',account?(account.enabled?'account-active':'account-disabled'):'muted'));
        }else tags.appendChild(createTag('NO YARD HUB ACCOUNT','muted'));
        const right=node('div','yard-staff-person-actions');
        if(canEdit()&&!person.archived_at)right.appendChild(button('EDIT','secondary',()=>openPersonModal(person)));
        if(canEdit()&&!person.archived_at)right.appendChild(button('ARCHIVE','danger',()=>archivePerson(person)));
        card.append(left,tags,right);list.appendChild(card);
      });
    };
    search.addEventListener('input',render);typeFilter.addEventListener('change',render);statusFilter.addEventListener('change',render);archivedToggle.addEventListener('change',render);
    render();
  }
  function fillSelect(select,items,selected='',placeholder='SELECT…'){
    select.replaceChildren();
    const first=node('option','',placeholder);first.value='';select.appendChild(first);
    items.forEach(item=>{const option=node('option','',item.label);option.value=item.value;option.selected=item.value===selected;select.appendChild(option)});
  }
  function modalShell(title,description){
    closeModal();
    const host=$('yardStaffModalHost');
    const backdrop=node('div','yard-staff-modal-backdrop');backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeModal()});
    const dialog=node('section','yard-staff-modal');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const head=node('header','yard-staff-modal-head');
    const heading=node('div','');heading.append(node('span','yard-staff-eyebrow','YARD OPERATIONS CORE · PERSONNEL CONTROL'),node('h2','',title),node('p','',description));
    const closeButton=button('×','icon',closeModal);closeButton.setAttribute('aria-label','Close editor');
    head.append(heading,closeButton);dialog.appendChild(head);
    const form=node('form','yard-staff-form');form.noValidate=true;dialog.appendChild(form);
    backdrop.appendChild(dialog);host.appendChild(backdrop);modal={backdrop,dialog,form};
    return form;
  }
  function field(labelText,control,help=''){
    const label=node('label','yard-staff-field');label.append(node('span','',labelText),control);
    if(help)label.appendChild(node('small','',help));return label;
  }
  function input(id,value='',type='text',placeholder=''){
    const item=node('input','yard-staff-input');item.id=id;item.type=type;item.value=value??'';item.placeholder=placeholder;return item;
  }
  function select(id,items,selected='',placeholder='SELECT…'){
    const item=node('select','yard-staff-input');item.id=id;fillSelect(item,items,selected,placeholder);return item;
  }
  async function openAccountManager(){
    closeModal();close();
    if(window.YARD_HUB_SETTINGS?.openUsers){
      try{await window.YARD_HUB_SETTINGS.openUsers()}catch(error){showNotice(error.message||'Unable to open account management.','error')}
    }else{
      showNotice('Open YARD HUB → HUB SETTINGS → USERS to create or disable login accounts, then return to STAFF MANAGEMENT.','');
    }
  }
  function syncPersonType(){
    const kind=$('yardStaffType'),box=$('yardStaffAccountBox'),account=$('yardStaffAccount');
    if(!kind||!box)return;
    box.hidden=kind.value!=='USER';
    if(kind.value==='STAFF'&&account&&'value' in account)account.value='';
    const hint=$('yardStaffAccountHint');
    if(hint)hint.textContent=kind.value==='USER'
      ?'USER means a linked, existing YARD HUB account. Accounts are created and disabled in HUB SETTINGS → USERS.'
      :'STAFF has no YARD HUB login account. If converting an existing USER, disable that account in HUB SETTINGS → USERS first.';
  }
  function openPersonModal(person){
    if(!canEdit()&&!(!person&&mode()==='INPUT'))return;
    const form=modalShell(person?'EDIT STAFF RECORD':'ADD PERSON','Personnel details are stored here. Login credentials remain in the existing YARD HUB account manager.');
    const name=input('yardStaffFullName',person?.full_name||'');
    const display=input('yardStaffDisplayName',person?.display_name||'');
    const typeOptions=canManageAccounts()
      ? [{value:'STAFF',label:'STAFF · NO YARD HUB ACCOUNT'},{value:'USER',label:'USER · LINKED YARD HUB ACCOUNT'}]
      : [{value:'STAFF',label:'STAFF · NO YARD HUB ACCOUNT'}];
    if(person?.staff_type==='USER'&&!canManageAccounts())typeOptions.splice(0,typeOptions.length,{value:'USER',label:'USER · EXISTING ACCOUNT LINK PRESERVED'});
    const type=select('yardStaffType',typeOptions,person?.staff_type||'STAFF');
    if(person?.staff_type==='USER'&&!canManageAccounts())type.disabled=true;
    const status=select('yardStaffStatus',[{value:'ACTIVE',label:'ACTIVE'},{value:'INACTIVE',label:'INACTIVE'},{value:'LEFT',label:'LEFT'}],person?.employment_status||'ACTIVE');
    const company=select('yardStaffCompany',(state.companies||[]).filter(x=>x.is_active&&!x.archived_at).map(x=>({value:x.id,label:x.name+' · '+x.company_type})),person?.company_id||'','NO COMPANY / AGENCY');
    const roles=(state.roles||[]).filter(x=>x.is_active&&!x.archived_at).map(x=>({value:x.id,label:x.name}));
    const primaryIds=person?activeAssignments(person.id):[];
    const primary=primaryIds.find(x=>x.is_primary)?.role_id||'';
    const primaryRole=select('yardStaffPrimaryRole',roles,primary,'NO PRIMARY ROLE');
    const assigned=primaryIds.filter(x=>!x.is_primary).map(x=>x.role_id);
    const secondary=node('select','yard-staff-input');secondary.id='yardStaffSecondaryRoles';secondary.multiple=true;secondary.size=Math.min(5,Math.max(3,roles.length));
    roles.forEach(role=>{if(role.value===primary)return;const option=node('option','',role.label);option.value=role.value;option.selected=assigned.includes(role.value);secondary.appendChild(option)});
    const start=input('yardStaffStartDate',person?.start_date||'','date');
    const notes=node('textarea','yard-staff-input');notes.id='yardStaffNotes';notes.rows=3;notes.value=person?.notes||'';
    let account;
    if(person?.staff_type==='USER'&&!canManageAccounts()){
      account=node('div','yard-staff-input','LINKED ACCOUNT · '+person.linked_username);
      account.id='yardStaffAccount';
      account.setAttribute('role','status');
    }else{
      account=select('yardStaffAccount',(state.accounts||[]).filter(x=>x.enabled||x.username===person?.linked_username).map(x=>({value:x.username,label:(x.displayName||x.username)+' · '+x.username+' · '+x.tier+(x.enabled?' · ACTIVE':' · DISABLED')})),person?.linked_username||'','SELECT EXISTING YARD HUB ACCOUNT');
    }
    const accountBox=node('div','yard-staff-account-box');accountBox.id='yardStaffAccountBox';
    const accountHint=node('p','yard-staff-note');accountHint.id='yardStaffAccountHint';
    const accountActions=node('div','yard-staff-inline-actions');
    if(canManageAccounts())accountActions.appendChild(button('OPEN ACCOUNT MANAGER','secondary',openAccountManager));
    accountBox.append(field('LINKED ACCOUNT',account),accountHint,accountActions);
    const grid=node('div','yard-staff-form-grid');
    grid.append(field('FULL NAME',name),field('DISPLAY NAME',display),field('CLASSIFICATION',type,'USER = linked YARD HUB account. STAFF = no account.'),field('EMPLOYMENT STATUS',status),field('COMPANY / AGENCY',company),field('START DATE',start),field('PRIMARY YARD ROLE',primaryRole),field('ADDITIONAL YARD ROLES',secondary,'Select multiple roles with your device’s multi-select gesture.'),field('NOTES',notes));
    form.appendChild(grid);form.appendChild(accountBox);
    const actions=node('div','yard-staff-modal-actions');
    actions.appendChild(button('CANCEL','secondary',closeModal));
    const save=node('button','yard-staff-button primary',person?'SAVE CHANGES':'ADD PERSON');save.type='submit';actions.appendChild(save);form.appendChild(actions);
    type.addEventListener('change',syncPersonType);syncPersonType();
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(save.disabled)return;
      const roleIds=[primaryRole.value,...Array.from(secondary.selectedOptions).map(x=>x.value)].filter(Boolean);
      const payload={
        id:person?.id||null,
        fullName:name.value.trim(),displayName:display.value.trim(),
        staffType:type.value,employmentStatus:status.value,companyId:company.value||null,
        linkedUsername:type.value==='USER'?(canManageAccounts()?(account?.value||''):(person?.linked_username||'')):'',
        startDate:start.value||null,notes:notes.value.trim(),
        roleIds:[...new Set(roleIds)],primaryRoleId:primaryRole.value||null
      };
      save.disabled=true;save.textContent='SAVING…';
      try{
        await callApi('person-save',payload);
        closeModal();await loadState();showNotice(person?'STAFF RECORD UPDATED.':'PERSON ADDED TO STAFF DIRECTORY.','ok');
      }catch(error){showNotice(error.message||'Staff record could not be saved.','error');save.disabled=false;save.textContent=person?'SAVE CHANGES':'ADD PERSON'}
    });
    form.querySelector('input')?.focus();
  }
  async function archivePerson(person){
    const label=person.display_name||person.full_name;
    if(!confirm('Archive '+label+'? The staff record and its history will be retained. A linked USER account must already be disabled.'))return;
    try{await callApi('person-archive',{id:person.id});await loadState();showNotice('STAFF RECORD ARCHIVED. HISTORY RETAINED.','ok')}
    catch(error){showNotice(error.message||'Staff record could not be archived.','error')}
  }
  function renderCompanies(host){
    const toolbar=node('div','yard-staff-toolbar');
    const title=node('div','yard-staff-section-title');title.append(node('h2','','COMPANIES & AGENCIES'),node('p','','Maintain the reusable employer directory. Staff profiles select an organisation from this list.'));
    toolbar.appendChild(title);const actions=node('div','yard-staff-actions');
    if(canEdit())actions.appendChild(button('＋ ADD COMPANY / AGENCY','primary',()=>openCompanyModal(null)));
    toolbar.appendChild(actions);host.appendChild(toolbar);
    const list=node('div','yard-staff-config-list');host.appendChild(list);
    (state.companies||[]).filter(item=>!item.archived_at).sort((a,b)=>a.name.localeCompare(b.name)).forEach(company=>{
      const row=node('article','yard-staff-config-row');
      const copy=node('div','yard-staff-config-copy');copy.append(node('strong','',company.name),node('small','',company.company_type+' · '+(company.is_active?'ACTIVE':'INACTIVE')));
      if(company.contact_name||company.contact_email||company.contact_phone)copy.appendChild(node('small','',[company.contact_name,company.contact_email,company.contact_phone].filter(Boolean).join(' · ')));
      const controls=node('div','yard-staff-person-actions');
      if(canEdit()&&company.is_active)controls.append(button('EDIT','secondary',()=>openCompanyModal(company)),button('ARCHIVE','danger',()=>archiveCompany(company)));
      row.append(copy,controls);list.appendChild(row);
    });
    if(!list.children.length)list.appendChild(node('div','yard-staff-empty','No companies or agencies configured.'));
  }
  function openCompanyModal(company){
    if(!canEdit())return;
    const form=modalShell(company?'EDIT COMPANY / AGENCY':'ADD COMPANY / AGENCY','Use a single reusable record for every employer. Existing staff history remains linked when an organisation is archived.');
    const name=input('yardStaffCompanyName',company?.name||'');
    const type=select('yardStaffCompanyType',[
      {value:'COMPANY',label:'COMPANY · DIRECT EMPLOYER'},
      {value:'AGENCY',label:'AGENCY'},
      {value:'CONTRACTOR',label:'CONTRACTOR'}
    ],company?.company_type||'COMPANY');
    const contact=input('yardStaffCompanyContact',company?.contact_name||'');
    const email=input('yardStaffCompanyEmail',company?.contact_email||'','email');
    const phone=input('yardStaffCompanyPhone',company?.contact_phone||'','tel');
    const notes=node('textarea','yard-staff-input');notes.id='yardStaffCompanyNotes';notes.rows=3;notes.value=company?.notes||'';
    const grid=node('div','yard-staff-form-grid');
    grid.append(field('ORGANISATION NAME',name),field('TYPE',type),field('CONTACT NAME',contact),field('CONTACT EMAIL',email),field('CONTACT PHONE',phone),field('NOTES',notes));
    form.appendChild(grid);
    const actions=node('div','yard-staff-modal-actions');actions.append(button('CANCEL','secondary',closeModal));
    const save=node('button','yard-staff-button primary',company?'SAVE CHANGES':'ADD ORGANISATION');save.type='submit';actions.appendChild(save);form.appendChild(actions);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(save.disabled)return;save.disabled=true;
      try{
        await callApi('company-save',{id:company?.id||null,name:name.value,companyType:type.value,contactName:contact.value,contactEmail:email.value,contactPhone:phone.value,notes:notes.value});
        closeModal();await loadState();activeTab='companies';renderTab();showNotice('COMPANY / AGENCY SAVED.','ok');
      }catch(error){showNotice(error.message||'Organisation could not be saved.','error');save.disabled=false}
    });
    name.focus();
  }
  async function archiveCompany(company){
    if(!confirm('Archive '+company.name+'? Existing staff records will retain their organisation history.'))return;
    try{await callApi('company-archive',{id:company.id});await loadState();activeTab='companies';renderTab();showNotice('COMPANY / AGENCY ARCHIVED.','ok')}
    catch(error){showNotice(error.message||'Organisation could not be archived.','error')}
  }
  function renderRoles(host){
    const toolbar=node('div','yard-staff-toolbar');
    const title=node('div','yard-staff-section-title');title.append(node('h2','','YARD ROLES'),node('p','','Create and maintain job roles independently of YARD HUB security tiers.'));
    toolbar.appendChild(title);const actions=node('div','yard-staff-actions');
    if(canEdit())actions.appendChild(button('＋ ADD YARD ROLE','primary',()=>openRoleModal(null)));
    toolbar.appendChild(actions);host.appendChild(toolbar);
    const list=node('div','yard-staff-config-list');host.appendChild(list);
    (state.roles||[]).filter(item=>!item.archived_at).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||a.name.localeCompare(b.name)).forEach(role=>{
      const count=(state.roleAssignments||[]).filter(item=>item.role_id===role.id&&!item.ended_at).length;
      const row=node('article','yard-staff-config-row');
      const copy=node('div','yard-staff-config-copy');copy.append(node('strong','',role.name),node('small','',role.description||'NO ROLE DESCRIPTION'),node('small','',count+' CURRENT ASSIGNMENT'+(count===1?'':'S')+' · '+(role.is_active?'ACTIVE':'INACTIVE')));
      const controls=node('div','yard-staff-person-actions');
      if(canEdit()&&role.is_active)controls.append(button('EDIT','secondary',()=>openRoleModal(role)),button('ARCHIVE','danger',()=>archiveRole(role)));
      row.append(copy,controls);list.appendChild(row);
    });
    if(!list.children.length)list.appendChild(node('div','yard-staff-empty','No Yard Roles configured.'));
  }
  function openRoleModal(role){
    if(!canEdit())return;
    const form=modalShell(role?'EDIT YARD ROLE':'ADD YARD ROLE','Yard Roles describe work performed. They do not grant YARD HUB application access.');
    const name=input('yardStaffRoleName',role?.name||'');
    const description=node('textarea','yard-staff-input');description.id='yardStaffRoleDescription';description.rows=3;description.value=role?.description||'';
    const order=input('yardStaffRoleOrder',String(role?.sort_order??100),'number');
    const grid=node('div','yard-staff-form-grid');grid.append(field('ROLE NAME',name),field('DISPLAY ORDER',order),field('DESCRIPTION',description));
    form.appendChild(grid);
    const actions=node('div','yard-staff-modal-actions');actions.append(button('CANCEL','secondary',closeModal));
    const save=node('button','yard-staff-button primary',role?'SAVE CHANGES':'ADD YARD ROLE');save.type='submit';actions.appendChild(save);form.appendChild(actions);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(save.disabled)return;save.disabled=true;
      try{
        await callApi('role-save',{id:role?.id||null,name:name.value,description:description.value,sortOrder:Number(order.value)||100});
        closeModal();await loadState();activeTab='roles';renderTab();showNotice('YARD ROLE SAVED.','ok');
      }catch(error){showNotice(error.message||'Yard Role could not be saved.','error');save.disabled=false}
    });
    name.focus();
  }
  async function archiveRole(role){
    if(!confirm('Archive the Yard Role '+role.name+'? Existing staff role history will be retained.'))return;
    try{await callApi('role-archive',{id:role.id});await loadState();activeTab='roles';renderTab();showNotice('YARD ROLE ARCHIVED.','ok')}
    catch(error){showNotice(error.message||'Yard Role could not be archived.','error')}
  }
  async function renderAudit(host){
    const toolbar=node('div','yard-staff-toolbar');
    const title=node('div','yard-staff-section-title');title.append(node('h2','','STAFF AUDIT HISTORY'),node('p','','A timestamped record of personnel, employer and Yard Role changes.'));
    toolbar.appendChild(title);toolbar.appendChild(button('↻ REFRESH','secondary',()=>{activeTab='audit';renderTab()}));host.appendChild(toolbar);
    const list=node('div','yard-staff-audit-list');host.appendChild(list);list.appendChild(node('div','yard-staff-empty','LOADING AUDIT HISTORY…'));
    try{
      const result=await callApi('audit');
      if(activeTab!=='audit')return;
      list.replaceChildren();
      (result.entries||[]).forEach(entry=>{
        const row=node('article','yard-staff-audit-row');
        const top=node('div','yard-staff-audit-top');
        top.append(node('strong','',entry.entity_type+' · '+entry.action),node('time','',new Date(entry.created_at).toLocaleString('en-GB')));
        row.append(top,node('span','', 'ACTOR · '+entry.actor));
        const data=entry.after_data?.person||entry.after_data||entry.before_data;
        const label=data?.display_name||data?.full_name||data?.name||data?.username||'Record '+String(entry.entity_id||'').slice(0,8);
        row.appendChild(node('small','',String(label)));
        list.appendChild(row);
      });
      if(!list.children.length)list.appendChild(node('div','yard-staff-empty','No staff changes have been recorded yet.'));
    }catch(error){list.replaceChildren(node('div','yard-staff-empty',error.message||'Audit history unavailable.'))}
  }

  window.YardHubStaff={open,close,refresh:()=>loadState()};
  window.addEventListener('yard-hub:shown',()=>{});
})();
