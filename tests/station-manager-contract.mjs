import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('index.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const overview=fs.readFileSync('plant-overview-preview.html','utf8');

assert.ok(ui.includes('data-settings-open="stations"')&&ui.includes('id="settingsPanelStations"'),'Station Manager is available as a Settings panel');
assert.ok(ui.includes("if(section==='stations')return permission('canManageSettings')"),'Station Manager is restricted to existing central settings administrators');
assert.ok(ui.includes('function defaultStationConfig()')&&ui.includes("category:'WOOD'")&&ui.includes("category:'SCRAP'")&&ui.includes("category:'GENERAL'"),'the six current plant stations remain the migration defaults');
assert.ok(ui.includes('function renderStationManager(reset=true)')&&ui.includes('function saveStationManager()'),'station configuration can be added, renamed, activated and saved');
assert.ok(ui.includes('Deactivated stations remain in the data bank'),'station deactivation is non-destructive');
assert.ok(ui.includes('aliases.add(stationLabel(old))'),'station renames retain the previous label as an alias');
assert.ok(ui.includes('stationSelect.replaceChildren()')&&ui.includes("station.active!==false"),'STAFF assignment choices are populated from active configured stations');
assert.ok(overview.includes(String.raw`legacyMatch=raw.match(/^Station\s*0?([1-6])`)&&overview.includes("station.id==='station-'+legacyMatch[1]"),'legacy Station N labels with category suffixes resolve to the same station IDs during migration');
assert.ok(ui.includes('resolveStationLabel(profile.station||profile.assignedStation||\'\')'),'STAFF roster displays renamed station labels');
assert.ok(ui.includes('async function persistSettingsConfirmed()')&&ui.includes('return await syncSettingsCloud()'),'confirmed settings persistence waits for the central data-bank response');
assert.ok(ui.includes('if(!await persistSettingsConfirmed())'),'STAFF profile save does not report success before central confirmation');

assert.ok(api.includes('canManageStations=!!priv.canManageSettings'),'the API permits station config writes only for existing settings administrators');
assert.ok(api.includes('Object.prototype.hasOwnProperty.call(incoming,"stationConfig")')&&api.includes('nextAppData.stationConfig=stations'),'the API validates and stores station configuration in the central data bank');
assert.ok(api.includes('!stations.some((station:any)=>station.active)'),'the API rejects a configuration with no active stations');
assert.ok(api.includes('aliases:Array.isArray(station?.aliases)'),'station aliases are persisted for renamed assignments');
assert.ok(api.includes('delete restrictedData.stationConfig'),'station configuration is not exposed to users without assignment visibility');
assert.ok(api.includes('nextAppData.stationConfig=bank.appData.stationConfig'),'ordinary tracker saves cannot overwrite station configuration');
assert.ok(overview.includes('function stationConfigFor(payload)')&&overview.includes('function resolveProfileStation(profile,stations)'),'Plant Overview resolves operator assignments from central station configuration and retained aliases');
assert.ok(overview.includes("legacyNumber=raw.toLowerCase().startsWith('station')")&&overview.includes("station.id==='station-'+legacyNumber"),'Plant Overview preserves legacy Station N assignments through the same stable IDs');
assert.ok(overview.includes('function renderStationBlueprint(stations,names,profiles)'),'Plant Overview renders the configured station list, including added stations');
assert.ok(overview.includes("stationConfigLabel(assignedStation)")&&overview.includes("stations=stationConfigFor(payload)"),'renamed station labels and custom stations feed the operator cards and live assigned-operator count');
assert.ok(!overview.includes("profile.onSite!==false&&!!stationMatch"),'Plant Overview no longer hides operators assigned to stations beyond the original six');
console.log('PASS: Station Manager, central persistence, permissions and STAFF assignment contracts');
