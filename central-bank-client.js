/* DOWNTIME Central Bank browser adapter — API only; no direct bank-table access. */
(function(){
  const endpoint=(window.DOWNTIME_CENTRAL_API||"").trim();
  const SESSION_KEY="downtime.central.session.v1";
  let session=null;
  try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null")}catch{}
  async function call(action,body={},token=session?.token){
    if(!endpoint)throw new Error("Central API endpoint is not configured.");
    const headers={"Content-Type":"application/json"};
    if(token)headers["x-downtime-session"]=token;
    const response=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({action,...body})});
    let result={};try{result=await response.json()}catch{}
    if(!response.ok)throw new Error(result.error||"Central API request failed.");
    return result;
  }
  window.DowntimeCentral={
    get session(){return session},
    async listUsers(){return call("list-users")},
    async login(username,pin){const result=await call("login",{username,pin},null);session={token:result.token,expiresAt:result.expiresAt,user:result.user};sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));return result.user},
    async logout(){try{if(session?.token)await call("logout",{},session.token)}finally{session=null;sessionStorage.removeItem(SESSION_KEY)}},
    async state(){return call("get-state")},
    async saveTracker(appData,version){return call("save-state",{appData,version})},
    async saveUser(data,version){return call("user-save",{...data,version})},
    async deleteUser(username,version){return call("user-delete",{username,version})},
    async saveStaff(name,profile,version){return call("staff-save",{name,profile,version})},
    async saveTiers(tiers,version){return call("tiers-save",{tiers,version})},
    async signedStaffPhotoUpload(name){return call("staff-photo-url",{name})},
    async signedStaffPhotoRead(path){return call("staff-photo-read",{path})},
    async bootstrap(data){return call("bootstrap",data,null)}
  };
})();
