import assert from "node:assert/strict";

const endpoint = "https://phfojlqezudbjslfrnyw.supabase.co/functions/v1/photo-evidence";
const origin = "https://aka30art.github.io";
const cases = [
  { action: "create-upload", entryKey: "00000000-0000-4000-8000-000000000001", mimeType: "image/jpeg", size: 1024 },
  { action: "view", attachmentId: "00000000-0000-4000-8000-000000000002" },
  { action: "delete", attachmentId: "00000000-0000-4000-8000-000000000002" },
];

for (const payload of cases) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": origin,
      "apikey": "sb_publishable_Ns316awmCfjz_xNQyA5qBw_tQ4YLtT1",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZm9qbHFlenVkYmpzbGZybnl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMTQ5MTQsImV4cCI6MjExMDc5MDkxNH0.K4stRdo1KhyuPbIR1-BxgCGcXhWaxjHQj0i76fZHVTU",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  assert.equal(response.status, 401, `${payload.action} must reject a request without a DOWNTIME session`);
  assert.equal(data.error, "A valid DOWNTIME session is required.");
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

console.log("Staging photo-evidence API rejects unauthenticated upload, view and delete requests.");
