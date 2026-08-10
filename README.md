# SwimFix

Fix phantom lengths in Garmin pool-swim FIT files — entirely in your browser.

Garmin watches often credit extra lengths when you pause mid-pool in a busy
lane or fumble a push-off. SwimFix decodes the FIT file locally, learns *your*
normal stroke count and length time from the swim itself, flags lengths that
don't fit, proposes merges/corrections you can accept or reject, and exports a
corrected FIT file.

## Use

    npm install
    npm run dev        # http://localhost:3000

Drop in a pool-swim `.fit` (Garmin Connect → activity → ⚙ → Export Original).
Review the proposed fixes, adjust manually if needed, download the corrected
file. In Garmin Connect **delete the original activity first**, then Import the
corrected file — Connect de-duplicates by start time.

Nothing is uploaded anywhere: parsing, analysis, and encoding all run
client-side (`@garmin/fitsdk`).

Note: re-encoding drops Garmin's undocumented proprietary messages (Connect
accepts such files; third-party swim editors do the same). Raw compressed HR
stream messages are dropped too — per-second heart rate is preserved via
record messages.

## Develop

    npm test           # Vitest — decode/detect/edit/encode against a real swim
    npm run typecheck
    npm run build      # static export to out/ — deployable to any static host
