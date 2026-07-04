# Split-Screen Reaction App (SDK 54)

Expo Go–compatible split-screen camera + video reaction preview for iPhone.

## Requirements

- **Expo Go SDK 54** from the App Store
- iPhone and PC on the same Wi‑Fi (or use tunnel mode)

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
