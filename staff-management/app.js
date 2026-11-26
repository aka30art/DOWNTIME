(() => {
  "use strict";
  const PROJECT_URL = "https://phfojlqezudbjslfrnyw.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_Ns316awmCfjz_xNQyA5qBw_tQ4YLtT1";
  const STAFF_API = PROJECT_URL + "/functions/v1/staff-management-api";
  const CENTRAL_API = PROJECT_URL + "/functions/v1/central-bank";
  const SESSION_KEY = "downtime.central.session.staging.v1";
  const $ = (id) => document.getElementById(id);
  const state = { session: null, staff: [], roles: [], links: [], audit: [], permissions: {}, tab: "staff", editingStaff: null };
  let toastTimer;

  try { state.session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch {}

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0,2).map(x => x[0] || "").join("").toUpperCase();
  const dateText = (value) => value ? new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "—";
  const notify = (message) => { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2800); };

  async function request(url, action, payload={}, token=null) {
    const headers = { "Content-Type":"application/json", "apikey":PUBLISHABLE_KEY };
    if (token) headers["x-downtime-session"] = token;
    const response = await fetch(url,{method:"POST",headers,body:JSON.stringify({action,...payload})});
    let result={}; try { result=await response.json(); } catch {}
    if (!response.ok) { const error=new Error(result.error || "Request failed."); error.status=response.status; throw error; }
    return result;
  }
  async function staffRequest(action,payload={}) {
    if (!state.session?.token) throw new Error("Staging sign-in required.");
    return request(STAFF_API,action,payload,state.session.token);
  }
  async function load() {
    const result=await staffRequest("bootstrap");
    state.staff=result.staff||[]; state.roles=result.roles||[]; state.links=result.accountLinks||[];
    state.audit=result.auditLogs||[]; state.permissions=result.permissions||{};
    $("sessionLabel").textContent="STAGING · "+String(result.user?.username||"SIGNED IN").toUpperCase();
    $("signInButton").hidden=true; $("signOutButton").hidden=false; $("accessGate").hidden=true; $("workspace").hidden=false;
    $("activityTab").hidden=!state.permissions.canManageStaff;
    $("addStaffButton").hidden=!state.permissions.canManageStaff;
    render();
  }
  function render() {
    $("activeCount").textContent=state.staff.filter(x=>x.status==="ACTIVE").length;
    $("archivedCount").textContent=state.staff.filter(x=>x.status==="ARCHIVED").length;
    renderStaff(); renderRoles(); renderAudit(); switchTab(state.tab);
  }
  function renderStaff() {
    const query=$("searchInput").value.trim().toLowerCase(), filter=$("statusFilter").value;
    const rows=state.staff.filter(item=>{
      const role=item.staff_site_roles?.display_name||"";
      return (filter==="ALL"||item.status===filter) && (!query||(item.display_name+" "+role).toLowerCase().includes(query));
    });
    $("staffList").innerHTML=rows.map(item=>{
      const role=item.staff_site_roles?.display_name||"Unassigned role";
      const active=item.status==="ACTIVE";
      return `<article class="sm-staff-card">
        <div class="sm-staff-main"><div class="sm-avatar">${escapeHtml(initials(item.display_name))}</div>
          <div style="min-width:0"><div class="sm-staff-name">${escapeHtml(item.display_name)}</div><div class="sm-staff-meta">${escapeHtml(role)} · Added ${escapeHtml(dateText(item.created_at))}</div></div>
        </div>
        <div class="sm-card-actions"><span class="sm-chip ${active?"active":"archived"}">${active?"ACTIVE":"ARCHIVED"}</span>
          ${state.permissions.canManageStaff ? (active ? `<button class="sm-mini-button" data-edit-staff="${item.id}">Edit</button><button class="sm-mini-button" data-archive-staff="${item.id}">Archive</button>` : `<button class="sm-mini-button" data-restore-staff="${item.id}">Restore</button>`) : ""}
        </div>
      </article>`;
    }).join("");
    $("staffEmpty").hidden=rows.length>0;
  }
  function renderRoles() {
    $("rolesList").innerHTML=state.roles.map(role=>`<article class="sm-role-card">
      <div><strong>${escapeHtml(role.display_name)}</strong><div class="sm-role-key">${escapeHtml(role.role_key)} · ORDER ${role.sort_order}</div></div>
      <div class="sm-card-actions"><span class="sm-chip ${role.is_active?"active":"archived"}">${role.is_active?"ACTIVE":"INACTIVE"}</span>
      ${state.permissions.canManageStaff? `<button class="sm-mini-button" data-edit-role="${role.id}">Edit</button>${role.is_active?`<button class="sm-mini-button" data-archive-role="${role.id}">Deactivate</button>`:`<button class="sm-mini-button" data-activate-role="${role.id}">Activate</button>`}`:""}</div>
    </article>`).join("");
    $("addRoleButton").hidden=!state.permissions.canManageStaff;
  }
  function renderAudit() {
    $("auditList").innerHTML=state.audit.map(item=>{
      const detail=item.after_data?.display_name||item.after_data?.account_username||item.after_data?.role_key||item.before_data?.display_name||item.entity_type;
      return `<article class="sm-audit-card"><div><div class="sm-audit-action">${escapeHtml(item.action.replaceAll("_"," "))}</div><div class="sm-audit-detail">${escapeHtml(detail)} · ${escapeHtml(item.entity_type.replaceAll("_"," "))}</div></div><div class="sm-audit-meta">${escapeHtml(item.actor_username)}<br>${escapeHtml(dateText(item.created_at))}</div></article>`;
    }).join("") || '<p class="sm-empty">No changes recorded yet.</p>';
  }
  function switchTab(tab) {
    state.tab=tab;
    $("staffPanel").hidden=tab!=="staff"; $("rolesPanel").hidden=tab!=="roles"; $("activityPanel").hidden=tab!=="activity";
    document.querySelectorAll(".sm-tab").forEach(btn=>{const active=btn.dataset.tab===tab;btn.classList.toggle("is-active",active);btn.setAttribute("aria-selected",String(active));});
  }
  function populateRoleSelect(selected="") {
    $("staffRole").innerHTML=state.roles.filter(role=>role.is_active||role.id===selected).map(role=>`<option value="${role.id}">${escapeHtml(role.display_name)}${role.is_active?"":" (inactive)"}</option>`).join("");
    if(selected)$("staffRole").value=selected;
  }
  function openStaff(item=null) {
    state.editingStaff=item?.id||null; $("staffFormError").textContent="";
    $("staffDialogTitle").textContent=item?"Edit staff member":"Add staff member";
    $("staffName").value=item?.display_name||"";
    populateRoleSelect(item?.site_role_id||"");
    $("staffDialog").showModal();
  }
  function openRole(item=null) {
    $("roleFormError").textContent="";
    $("roleDialog").dataset.roleId=item?.id||"";
    $("roleDialogTitle").textContent=item?"Edit on-site role":"Add on-site role";
    $("roleName").value=item?.display_name||"";
    $("roleKey").value=item?.role_key||"";
    $("roleKey").readOnly=!!item;
    $("roleOrder").value=item?.sort_order??100;
    $("roleDialog").showModal();
  }
  async function signIn(username,pin) {
    const result=await request(CENTRAL_API,"login",{username,pin},null);
    state.session={token:result.token,expiresAt:result.expiresAt,user:result.user};
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(state.session));
    await load();
  }
  async function signOut() {
    try { if(state.session?.token) await request(CENTRAL_API,"logout",{},state.session.token); } catch {}
    state.session=null; sessionStorage.removeItem(SESSION_KEY);
    $("workspace").hidden=true; $("accessGate").hidden=false; $("signInButton").hidden=false; $("signOutButton").hidden=true;
    $("sessionLabel").textContent="STAGING · NOT SIGNED IN";
  }

  document.querySelectorAll(".sm-tab").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.tab)));
  $("searchInput").addEventListener("input",renderStaff); $("statusFilter").addEventListener("change",renderStaff);
  $("addStaffButton").addEventListener("click",()=>openStaff());
  $("addRoleButton").addEventListener("click",()=>openRole());
  $("signInButton").addEventListener("click",()=>$("loginDialog").showModal());
  $("gateSignInButton").addEventListener("click",()=>$("loginDialog").showModal());
  $("signOutButton").addEventListener("click",signOut);
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>$(btn.dataset.close).close()));

  $("staffForm").addEventListener("submit",async event=>{
    event.preventDefault(); $("staffFormError").textContent="";
    const button=$("saveStaffButton"); button.disabled=true;
    try {
      const payload={display_name:$("staffName").value.trim(),site_role_id:$("staffRole").value};
      await staffRequest(state.editingStaff?"update-staff":"create-staff",state.editingStaff?{...payload,staff_member_id:state.editingStaff}:payload);
      $("staffDialog").close(); await load(); notify(state.editingStaff?"Staff record updated.":"Staff member added.");
    } catch(error) {$("staffFormError").textContent=error.message;}
    finally {button.disabled=false;}
  });
  $("roleForm").addEventListener("submit",async event=>{
    event.preventDefault(); $("roleFormError").textContent="";
    try {
      const id=$("roleDialog").dataset.roleId;
      const payload={display_name:$("roleName").value.trim(),sort_order:Number($("roleOrder").value)};
      if(!id)payload.role_key=$("roleKey").value.trim().toLowerCase();
      await staffRequest(id?"update-role":"create-role",id?{...payload,role_id:id}:{...payload});
      $("roleDialog").close(); await load(); notify("On-site role saved.");
    } catch(error) {$("roleFormError").textContent=error.message;}
  });
  $("loginForm").addEventListener("submit",async event=>{
    event.preventDefault(); $("loginError").textContent=""; $("loginSubmit").disabled=true;
    try { await signIn($("loginUsername").value.trim(),$("loginPin").value); $("loginDialog").close(); $("loginPin").value=""; notify("Signed in to staging."); }
    catch(error){$("loginError").textContent=error.message;}
    finally{$("loginSubmit").disabled=false;}
  });

  document.addEventListener("click",async event=>{
    const button=event.target.closest("[data-edit-staff],[data-archive-staff],[data-restore-staff],[data-edit-role],[data-archive-role],[data-activate-role]");
    if(!button)return;
    try {
      if(button.dataset.editStaff){openStaff(state.staff.find(x=>x.id===button.dataset.editStaff));return;}
      if(button.dataset.editRole){openRole(state.roles.find(x=>x.id===button.dataset.editRole));return;}
      if(button.dataset.archiveStaff && confirm("Archive this staff record? Historical records will be retained.")){await staffRequest("archive-staff",{staff_member_id:button.dataset.archiveStaff});notify("Staff record archived.");}
      if(button.dataset.restoreStaff){await staffRequest("restore-staff",{staff_member_id:button.dataset.restoreStaff});notify("Staff record restored.");}
      if(button.dataset.archiveRole && confirm("Deactivate this role? Existing staff records will retain it.")){await staffRequest("archive-role",{role_id:button.dataset.archiveRole});notify("Role deactivated.");}
      if(button.dataset.activateRole){const role=state.roles.find(x=>x.id===button.dataset.activateRole);await staffRequest("update-role",{role_id:role.id,is_active:true});notify("Role activated.");}
      await load();
    } catch(error){notify(error.message);}
  });

  if(state.session?.token && state.session.expiresAt && new Date(state.session.expiresAt)>new Date()) {
    load().catch(async error=>{await signOut(); $("gateDetail").textContent=error.message;});
  }
})();