# Sharing between phones: Firebase setup

Sharing stores the household in Google Firebase (free Spark plan). One-time setup:

1. https://console.firebase.google.com → **Create a project** → name `fridgeapp` → turn **off** Google Analytics → Create.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
3. **Build → Firestore Database → Create database** → location `northamerica-northeast1 (Montréal)` → **Start in production mode** → Create.
4. Firestore → **Rules** → replace everything with the rules below → **Publish**.
5. ⚙️ **Project settings → General → Your apps → Web (`</>`)** → nickname `fridgeapp` → Register app → copy the `firebaseConfig` values into `firebase-config.js`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // A household can be opened only by someone who knows its 20-character code.
    match /households/{hid} {
      allow get, create, update: if request.auth != null && hid.size() == 20;
    }
    match /households/{hid}/{coll}/{id} {
      allow read, write: if request.auth != null && hid.size() == 20
        && coll in ['items', 'events', 'purchases', 'meta'];
    }
  }
}
```

The web config values are not secrets; the rules plus the unguessable household code keep each household private.
