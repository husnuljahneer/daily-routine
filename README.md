# Daily Routine — offline iPhone checklist

A local-first React Native + Expo + SQLite starter app. No account, backend, cloud database, or network requests are used for core features.

## Included

- Day-by-day editable checklist (add, edit, complete, skip, delete)
- Date navigation and task history
- Reusable templates: gym, rest, travel, morning skincare, evening skincare, travel skincare
- Create custom templates using one task per line, optionally `Task name | Category`
- Apply templates without replacing existing tasks
- Water logging in 150 ml, 250 ml, and 500 ml increments; undo last entry
- Adjustable water goal (starts at 3 L/day)
- SQLite persistence on the device

## Requirements

- macOS with Xcode installed for native iPhone installation
- Node.js LTS and npm
- An iPhone connected to the Mac (USB or wireless debugging)
- An Apple ID for signing the app in Xcode

## Run the app

From this directory:

```bash
npm install
npx expo install --fix
npx expo run:ios
```

The first `expo run:ios` builds the native iOS project and opens it in the iOS Simulator by default if no device is selected. For a physical iPhone, connect it, open the generated `ios/DailyRoutine.xcworkspace` in Xcode, select your iPhone as the run destination, set a development team under **Signing & Capabilities**, then press **Run**. You may need to enable Developer Mode on the iPhone and trust your developer certificate. For a standalone release build that bundles the JavaScript instead of relying on the Metro development server, use `npx expo run:ios --configuration Release --device` after configuring signing, or create an Archive in Xcode and install/distribute it from there.

Alternatively, start the Metro bundler for development:

```bash
npx expo start
```

A development build can use Metro during development. Once the app is installed and built, the core app does not require Metro or internet to manage tasks and water logs.

## Version and native setup

This starter targets Expo SDK 54 dependencies. If Expo recommends a newer compatible package patch, use `npx expo install --fix` and verify the app in Xcode. A native iOS build requires macOS/Xcode; it cannot be compiled directly on Windows or in a Linux-only environment.

## Important notes

- Data is stored in the app's local SQLite database (`daily-routine.db`). Uninstalling the app may remove this data. Add export/import backups before relying on it as the only copy of your routine history.
- Water target is configurable and defaults to 3,000 ml; that is a user preference, not medical advice.
- The starter uses local state and SQLite only; no analytics or network requests are included.
- For long-term production use, add automated tests, database migrations, backup/export, accessibility review, and an explicit data-retention policy.
