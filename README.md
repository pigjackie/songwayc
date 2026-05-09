# Songwayc MVP (Step 2)

## Run locally
- Open `src/index.html` directly in browser for UI preview.
- For real Firebase auth/session behavior, use local server (for example VS Code Live Server).

## Firebase setup
1. Authentication -> enable Email/Password.
2. Firestore -> create database.
3. (Optional) Hosting deploy:
   - `npm install -g firebase-tools`
   - `firebase login`
   - `firebase use songwayc-2fba1`
   - `firebase deploy`

## Notes
- Admin is currently inferred by email containing `song` or `eric`.
- Next step should switch to strict role from `/users/{uid}.role`.
