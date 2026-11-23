# STAFF Originals

Canonical image source is this folder. DOWNTIME uploads/replaces the member's `original.png` through the secure Central Bank Edge Function. The function requires a server-only GitHub fine-grained token with Contents: Read and write access to the `aka30art/DOWNTIME` repository. It must never be exposed in frontend code.

Staff folders:
- jan/original.png
- mick/original.png
- gigi/original.png
- daz/original.png
- shayne/original.png

The app's image resolver reads these raw repository assets and falls back to the legacy Central photo if an original is not present yet.
