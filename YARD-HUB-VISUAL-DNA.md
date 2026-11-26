# YARD HUB — Unified Visual DNA v1.0

**Status:** Approved implementation baseline  
**Scope:** YARD HUB launcher, YARD HUB settings, GATELOG, R&M and future YARD HUB departments  
**Change class:** Aesthetic / presentation only

## Design objective

YARD HUB is one operational platform with multiple departments. Each department retains its own information architecture, workflows and operational controls, while every department shares the same visual grammar. The R&M department header is the canonical reference for department header construction.

## Core visual tokens

| Token | Standard |
|---|---|
| Primary background | `#07131C` |
| Panel surface | `#101F2B` |
| Raised panel | `#1A2D3B` |
| Border | `#334B5D` |
| Primary text | `#F3F6F8` |
| Secondary text | `#9AAFBD` |
| Industrial yellow | `#FFC400` |
| Small / medium / large radius | `9px / 12px / 14px` |
| Typography | Inter / system sans-serif; compact, bold operational hierarchy |
| Primary graphic | Fine technical grid plus a narrow diagonal yellow slash |
| Surface treatment | Dark navy gradients, fine slate borders and restrained shadows |

## Department header specification

GATELOG and R&M share the same structural measurements and component styling:

- Desktop: 158px minimum height, 18px 24px padding, 14px radius.
- Mobile: 138px minimum height, 13px 14px padding, 12px radius.
- Dark navy horizontal gradient and technical grid concentrated on the right.
- Narrow diagonal yellow accent: 10px desktop and 8px mobile. Never a broad yellow panel.
- DOWNTIME wordmark at top left with a short yellow underline.
- Authenticated session identity and consistent 46px desktop / 40px mobile icon buttons at top right.
- Large italic department title with yellow / white contrast.
- Uppercase subtitle beneath the title, with mobile-safe wrapping.

Department names and subtitles vary; header structure and measurements remain consistent.

## Component system

**Panels and cards:** dark navy gradient surfaces, 1px slate-blue borders, 12–14px radii and restrained shadows.

**Buttons:** yellow fill for primary actions; dark navy gradient with slate border for secondary actions; consistent height, typography, radius and interaction states.

**Forms:** dark input surfaces, fine slate borders, consistent field labels and touch-friendly control height.

**Tables and registers:** dark header rows, uppercase column labels, fine horizontal dividers and consistent muted metadata.

**Status and statistics:** yellow for key values and active / important states; muted slate for descriptive labels. Semantic warning and error colours remain available where needed.

**Future departments:** “Coming Later” tiles use the same tile geometry, colours, border, typography and spacing as active departments. Availability state may differ; visual identity does not.

## Responsive rules

Desktop, tablet and mobile layouts use the same component grammar. Header proportions, button sizes, card radii, gutters and text hierarchy adapt at defined breakpoints without introducing a separate visual theme. No horizontal page overflow is permitted.

## Isolation and protected boundary

This design system is presentation-only. It must not change business logic, navigation behaviour, authentication, permissions, APIs, database schemas, stored data or module workflows.

**The DOWNTIME Tracking App is explicitly excluded.** The new stylesheet contains no global `html`, `body`, `:root`, generic `button`, `main`, `.shell`, or Tracking App selectors. It only styles the approved YARD HUB, GATELOG and R&M namespaces.

Future departments must adopt the same tokens and component standards through their own YARD HUB namespace.

## Implementation

`yard-hub-visual-system.css` is the scoped presentation layer. It is loaded by the YARD HUB application shell and the standalone R&M module. It contains no scripts or workflow logic.
