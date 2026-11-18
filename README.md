# Plant Downtime Tracker

A dependency-free weekly downtime recording app designed for GitHub Pages.

## Features
- Monday–Saturday weekly sheets and individual day detail.
- Preset plant-area and downtime-reason buttons, plus manual entry.
- Manual duration entry in hours and minutes.
- Plant start/stop times and automatic 75-minute daily break deduction.
- Daily and correctly weighted weekly downtime/running percentages.
- Edit/delete entries and browser-local persistence.
- Weekly report print layout for saving as PDF.
- Export/reset confirmation and an archive index stored in the same browser.

## Deploy with GitHub Pages
1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select branch **main**, folder **/ (root)**, then Save.
4. Wait for the Pages deployment, then open the published URL.

## Data and export behaviour
This first version stores active weeks and the report archive in the browser's local storage. Use the same browser/device for continuity. It does not sync data between devices or users. PDF export uses the browser print dialog; select **Save as PDF**. The archive stores report summary metadata, not the PDF file itself. Keep downloaded PDFs separately.

The week is only reset after the user confirms **Export & Reset**. The browser's print/save dialog is opened first; browser print APIs cannot verify that the user completed a PDF download. For strict download-confirmed reset, a server-backed export/download flow is required.
