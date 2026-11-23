# DOWNTIME STAFF IMAGE LIBRARY

This folder is the canonical source for original-resolution STAFF portraits. The app uses the per-person original image when available and falls back to the legacy Central photo if the library image fails.

## Directory convention

Each STAFF member has an individual folder and a fixed canonical filename:

- `jan/original.png`
- `mick/original.png`
- `gigi/original.png`
- `daz/original.png`
- `shayne/original.png`

## Uploading from DOWNTIME

Choose a STAFF member in STAFF MANAGEMENT, upload a portrait, preview it, then save. The app routes the upload to that member's folder and replaces `original.png`. Uploads require the `canManageStaff` permission and a secure server-side GitHub write token. Never put a GitHub token in browser code.

PNG is the canonical library format. Uploads are validated and size-limited server-side. Git history retains prior versions of replaced files.
