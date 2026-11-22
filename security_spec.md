# Security Specification — ORDAL Esports Hub Firestore Rules (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Catch-All**: No collection or subcollection is accessible unless explicitly matched and authorized.
2. **Verified Email Mandate**: Every authenticated write (except public reads on non-PII catalogs) requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Zero Client-Claim Trust & No Self-Role Escalation**: Users cannot assign themselves `SUPER_ADMIN`, `LEAGUE_OPS`, or `CASTER` during `/users/{userId}` creation unless `request.auth.token.email.lower() == 'abdulfikri29@gmail.com'` OR an admin-signed `/roleInvites/{inviteId}` matches their verified Google email and exact role. Users can never modify `role`, `uid`, `email`, or `casterId` on update.
4. **PII Isolation**:
   - `/users/{userId}` and `/squadsPrivate/{squadId}` (captain contact) are never publicly readable; only owner or authorized ops/admin may read.
   - `/payments/{paymentId}` and `/withdrawals/{withdrawalId}` are restricted to `ownerUid` / `casterUid` or `SUPER_ADMIN`.
   - `/ledger/{ledgerId}`, `/auditLogs/{logId}`, `/socEvents/{eventId}`, `/socBlockedIps/{ipId}`, and `/socSettings/{settingId}` are restricted exclusively to `SUPER_ADMIN`.
   - Public `/scrims/{scrimId}` and `/squads/{squadId}` strip email/phone PII completely.
5. **Path Hardening & Volumetric Bounds**: All single-document operations (`get`, `create`, `update`, `delete`) validate `isValidId(docId)` (`^[a-zA-Z0-9_\\-]+$`, max 128 chars). Every string and array validates `.size()` bounds.
6. **Immutability & Terminal Locking**:
   - `auditLogs` are append-only (`allow update, delete: if false;`).
   - `scrims` in `CANCELLED` status and `payments` in `VERIFIED` status cannot be mutated by non-admin users.
   - `users.uid`, `users.email`, `users.role`, `squads.ownerUid`, `payments.ownerUid`, and `withdrawals.casterUid` are immutable after creation.
7. **Atomicity on Squad Registration**: Creating `/squads/{squadId}` by a team checks `exists(/databases/$(database)/documents/tournaments/$(incoming().tournamentId))` and enforces atomic `/squadsPrivate/{squadId}` creation via `existsAfter`.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: `PERMISSION_DENIED`)
1. **Self-Role Escalation on Registration**: `TEAM` user writes `/users/{uid}` with `{ uid, email, displayName: "Attacker", role: "SUPER_ADMIN", createdAt }`.
2. **Profile Role Tampering Update**: Authenticated `TEAM` user updates `/users/{uid}` changing `role` from `"TEAM"` to `"LEAGUE_OPS"`.
3. **Ghost Shadow Field Injection**: Authenticated `TEAM` user creates `/scrims/scrim-evil` including extra field `isAdminApproved: true` or `hostPaid: true` on non-admin create.
4. **Unverified Email Spoof**: User with `email: "abdulfikri29@gmail.com"` and `email_verified: false` attempts admin write to `/tournaments/trn-1`.
5. **Path ID Poisoning**: Attacker attempts `setDoc` on `/squads/${'A'.repeat(500)}` or `/news/bad..id`.
6. **PII Blanket Read / Query Scraping**: Authenticated `TEAM` user queries `getDocs(collection(db, 'users'))` or `getDocs(collection(db, 'payments'))` without owner filter.
7. **Other User Payment Tampering**: `TEAM` user A attempts to update `/payments/{paymentIdOfTeamB}` setting `status: "VERIFIED"`.
8. **Terminal State Bypass**: `TEAM` user attempts to mutate a `VERIFIED` payment or `CANCELLED` scrim.
9. **Audit Log Erasure / Tampering**: Even a compromised client or `LEAGUE_OPS` attempts `updateDoc` or `deleteDoc` on `/auditLogs/{logId}`.
10. **Oversized Denial-of-Wallet String**: Authenticated user submits a `/scrims/{id}` payload with a 1MB `hostTeamName` string.
11. **Orphaned Squad Injection**: `TEAM` user creates `/squads/sq-orphan` referencing a non-existent `tournamentId: "non-existent-trn"`.
12. **SOC Security Bypass**: `TEAM` or `CASTER` reads `/socEvents` or deletes `/socBlockedIps/{ipId}`.
