/* DOWNTIME STAFF IMAGE LIBRARY: original-resolution images live in per-staff folders.
The repository originals are canonical; failed image requests fall back to the legacy Central profile photo. */
(() => {
 const BASE='https://raw.githubusercontent.com/aka30art/DOWNTIME/main/assets/staff/originals/';
 const registry={jan:{file:'jan/original.png',available:true},mick:{file:'mick/original.png',available:true},gigi:{file:'gigi/original.png',available:true},daz:{file:'daz/original.png',available:true},shayne:{file:'shayne/original.png',available:true}};
 const key=n=>String(n||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
 function fallback(img,profile){img.onerror=null;if(profile?.photo){img.src=profile.photo;return;}if(profile?.photoPath&&window.DowntimeCentral?.signedStaffPhotoRead)window.DowntimeCentral.signedStaffPhotoRead(profile.photoPath).then(r=>{if(img.isConnected&&r?.url)img.src=r.url}).catch(()=>{});}
 window.DowntimeStaffImages={registry,resolve(name){const e=registry[key(name)];return e?.available?BASE+e.file:null;},apply(img,name,profile){const url=this.resolve(name);if(url){img.onerror=()=>fallback(img,profile);img.src=url;}else fallback(img,profile);}};
})();
