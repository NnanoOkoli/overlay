# Split-Screen Reaction App (SDK 56)

Expo Go–compatible split-screen camera + video reaction preview for iPhone.

## Requirements

- **Expo Go** from the App Store (must support **SDK 56** — check the version shown in Expo Go settings)
- iPhone and PC on the same Wi‑Fi (or use tunnel mode)

> **Note:** This project uses **SDK 56** because SDK 57 Expo Go is not yet available on the iOS App Store. If Expo Go shows an SDK mismatch error, check which SDK your Expo Go supports and let us know.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npm start
   ```

   **Run on iPhone (Expo Go):**

   1. Open **Expo Go → Scan QR code** (not the iPhone Camera app).
   2. If scan fails, run `npm run start:tunnel` and scan again.
   3. Or tap **Enter URL manually** in Expo Go and paste the `exp://…` URL from the terminal.
   4. Grant camera and microphone when prompted.

## Stage 2

Screen recording and compositing require a custom dev build (EAS). See the setup guide for details.
