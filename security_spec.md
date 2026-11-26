# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. A `UserProfile` document at `/users/{userId}` can only be read, created, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == userId`, with `uid == userId` and server timestamps (`request.time`).
2. `/users` cannot be listed by any client (`allow list: if false`).
3. A `ScoreEntry` document at `/scores/{userId}` can only be created, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == userId`.
4. Score updates cannot decrease an existing high score (`incoming().score >= existing().score`), cannot exceed `1000000`, and cannot spoof `uid`.
5. `list` queries on `/scores` enforce `resource.data.score is int && resource.data.score >= 0` in the rule itself, paired with client-side `where('score', '>=', 0)` + `orderBy('score', 'desc')` + `limit(5)`.
6. All unknown collections/paths are denied by default (`match /{document=**} { allow read, write: if false; }`).

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated profile read**: Unauthenticated `get(/users/user123)`.
2. **Cross-user profile read**: Authenticated as `userA` reading `/users/userB`.
3. **User directory scraping**: Authenticated `list(/users)`.
4. **UID spoofing on profile create**: `userA` creating `/users/userA` with `{ uid: "userB", ... }`.
5. **Shadow/Ghost field injection on profile create**: `userA` creating `/users/userA` with `{ ..., isAdmin: true }`.
6. **Unverified email write**: User with `email_verified: false` attempting `create` on `/users/userA`.
7. **Client timestamp forgery**: `userA` creating `/users/userA` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
8. **Immutable field tampering on profile update**: `userA` updating `/users/userA` to change `uid` or `createdAt`.
9. **Resource exhaustion (1MB string)**: `userA` setting `displayName` to a 500-character string (`> 50`).
10. **ID poisoning**: Attempt to write `/scores/` with invalid characters like `user$bad!id` or length `> 128`.
11. **Negative or float score poisoning**: `userA` writing `/scores/userA` with `score: -10` or `score: 999999999` or `score: "999"`.
12. **Score hijacking**: `userA` writing `/scores/userB` to overwrite another player's leaderboard entry.
