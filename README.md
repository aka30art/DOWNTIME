# Plant Downtime Tracker

A dependency-free weekly downtime recording app designed for GitHub Pages.

## Features
- JAN-only application access and administrator PIN login; STAFF records remain separate.
- Monday–Saturday weekly sheets and individual day detail.
- Preset plant-area and downtime-reason buttons, plus manual entry.
- Manual duration entry in hours and minutes.
- Plant start/stop times and automatic 75-minute daily break deduction.
- Daily and correctly weighted weekly downtime/running percentages.
- Edit/delete entries and browser-local persistence.
- Weekly report print layout for saving as PDF.
- Direct browser print-to-PDF export (choose Save as PDF in the print/share sheet). The export preserves the active week; automatic reset/archive is intentionally disabled because browsers cannot confirm that a PDF was actually saved.

## Deploy with GitHub Pages
1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Push to `main` or manually run **Deploy Plant Downtime Tracker** from the Actions tab.
4. Wait for the workflow's **Deploy** job to succeed, then open https://aka30art.github.io/DOWNTIME/.

## Data and export behaviour
This first version stores active weeks and the report archive in the browser's local storage. Use the same browser/device for continuity. It does not sync data between devices or users. PDF export uses the browser print dialog; select **Save as PDF**. 

PDF export opens the browser's print dialog. The app does not automatically reset or archive a week because the browser cannot tell whether a user saved the PDF or cancelled printing. Reset/archive needs a separate explicit action or server-backed download flow.
