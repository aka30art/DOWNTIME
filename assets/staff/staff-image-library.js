/* DOWNTIME STAFF IMAGE LIBRARY: originals are stored in assets/staff/originals/.
Only enabled entries are served; otherwise existing Central staff photo storage is used. */
(() => {
 const BASE='https://raw.githubusercontent.com/aka30art/DOWNTIME/main/assets/staff/originals/';
 const registry={jan:{file:'jan.jpg',available:false},mick:{file:'mick.jpg',available:false},gigi:{file:'gigi.jpg',available:false},daz:{file:'daz.jpg',available:false},shayne:{file:'shayne.jpg',available:false}};
 const key=n=>String(n||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
 function fallback(img,profile){img.onerror=null;if(profile?.photo){img.src=profile.photo;return;}if(profile?.photoPath&&window.DowntimeCentral?.signedStaffPhotoRead)window.DowntimeCentral.signedStaffPhotoRead(profile.photoPath).then(r=>{if(img.isConnected&&r?.url)img.src=r.url}).catch(()=>{});}
 window.DowntimeStaffImages={registry,resolve(name){const e=registry[key(name)];return e?.available?BASE+e.file:null;},apply(img,name,profile){const url=this.resolve(name);if(url){img.onerror=()=>fallback(img,profile);img.src=url;}else fallback(img,profile);}};
})();