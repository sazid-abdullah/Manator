# Tuitrix Google Play Store & TWA Guide

This guide covers building the Trusted Web Activity (TWA) Android app for Tuitrix using `bubblewrap`, and uploading it to the Google Play Store.

## 1. Environment Setup

You need Node.js and the Bubblewrap CLI:
```bash
npm install -g @bubblewrap/cli
```

Make sure you have JDK 17+ and the Android SDK installed. Run `bubblewrap doctor` to verify.

## 2. Initialization & Building

Initialize the project from the `twa-manifest.json` configuration:
```bash
bubblewrap init --manifest twa-manifest.json
```
Follow the prompts to configure your Android Keystore (passwords, alias).

Once initialized, build the APK and AAB:
```bash
bubblewrap build
```
This will generate `app-release-bundle.aab` (for Play Store upload) and `app-release.apk` (for local testing).

## 3. Digital Asset Links (TWA Verification)

To hide the Chrome address bar, you must prove ownership of `tuitrix.com`.

1. Get the SHA-256 fingerprint from your keystore (or Play Console App Signing page):
   ```bash
   keytool -list -v -keystore android.keystore -alias your_alias_name
   ```
2. Replace `VITE_ANDROID_CERT_SHA256` in `public/.well-known/assetlinks.json` with the actual fingerprint (e.g., `FA:2A:42:0B...`).
3. Deploy Tuitrix so the file is accessible at `https://tuitrix.com/.well-known/assetlinks.json`.

## 4. Play Store ASO Listing Information

**Short Description (≤ 80 chars):**
Smart Tuition & Batch Manager with Fees tracking, AI Exam Maker & Analytics.

**Full Description:**
Tuitrix is the ultimate smart tuition and batch management app designed for tutors, coaching centers, and private educators. Replace messy spreadsheets and notebooks with a unified platform that tracks everything.

Key Features:
- **Student & Batch Tracking:** Manage student profiles, schedules, and attendance.
- **Smart Fee Management:** Automated reminders for pending fees and cycle tracking.
- **AI Exam Maker:** Instantly generate MCQs, Creative Questions (CQ), and Worksheets.
- **Push Notifications:** Send automated class and fee reminders.
- **Cloud Sync & Offline Mode:** Access your data anywhere, even without internet.

Whether you're teaching 5 students or 500, Tuitrix streamlines your workflow so you can focus on teaching.

**Tags:**
Education, Productivity, Finance, Tuition Manager, Coaching Center, Batch Manager.

**Data Safety:**
- User data (students, schedules, payments) is encrypted and synced to cloud (if authenticated).
- AI requests do not include PII (Personally Identifiable Information).
- No data is sold to third parties.
