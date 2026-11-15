# CareConnect AI Security Specification

## 1. Data Invariants
1. **User PII Isolation**: `/users/{userId}` documents contain PII (`email`, `phone`, `emergencyContact`) and may only be read, created, or updated by `request.auth.uid == userId` with `request.auth.token.email_verified == true`. List queries on `/users` are strictly forbidden.
2. **Master Gate Membership**: Every Care Circle subcollection (`medications`, `medicationLogs`, `appointments`, `healthRecords`, `routines`, `routineLogs`, `messages`, `notifications`) is gated by `exists(/databases/$(database)/documents/careCircles/$(circleId)/members/$(request.auth.uid))`.
3. **Atomic Join via Invite Code**: A user can only add themselves (`memberUid == request.auth.uid`) to `/careCircles/{circleId}/members/{memberUid}` and append their own UID to `careCircles/{circleId}.memberIds` inside an atomic batch when holding a valid active `/circleInvites/{inviteCode}` matching `circleId`.
4. **Immutable Ownership & Timestamps**: `ownerId`, `createdByUid`, `senderUid`, `circleId`, and `createdAt` are immutable after creation; `createdAt == request.time` and `updatedAt == request.time` are enforced server-side.
5. **No Unbounded Arrays or Shadow Fields**: All arrays are bounded (`memberIds.size() <= 15`, `scheduledTimes.size() <= 6`, `readByUids.size() <= 15`). Every `create` checks `keys().hasAll(...) && keys().hasOnly(...)`; every `update` uses action-based `affectedKeys().hasOnly(...)` combined with `isValid[Entity](incoming())`.
6. **Terminal State Locking**: Appointments with `status == 'completed'` or `status == 'cancelled'` cannot be transitioned back or modified except by the Care Circle owner (`isCircleOwner`) or for `syncMembers`.
7. **Secure List Queries**: Every `allow list` rule evaluates `request.auth.uid in resource.data.memberIds` without `get()` or `exists()` calls.

## 2. Dirty Dozen Adversarial Payloads
1. **Unverified Email Spoof**: Signed-in user with `email_verified: false` attempts to write to `/users/{uid}`. -> `PERMISSION_DENIED`.
2. **Cross-User PII Read**: User B attempts `get` on `/users/{userA_uid}`. -> `PERMISSION_DENIED`.
3. **Privilege Escalation on Join**: User B joins via invite code and sets `isCoordinator: true` on `/careCircles/{circleId}/members/{userB_uid}`. -> `PERMISSION_DENIED`.
4. **Ghost Field Shadow Write**: Member creates a Medication with an extra undocumented field `isVerified: true`. -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Message**: User A creates a CareMessage with `senderUid: userB_uid`. -> `PERMISSION_DENIED`.
6. **Timestamp Forgery**: User creates a HealthRecord with backdated `createdAt` not equal to `request.time`. -> `PERMISSION_DENIED`.
7. **ID Poisoning**: User creates a Medication with document ID `../../admin` or > 128 chars. -> `PERMISSION_DENIED`.
8. **Orphan Subcollection Write**: Non-member creates a Medication under `/careCircles/{otherCircleId}/medications/{id}`. -> `PERMISSION_DENIED`.
9. **Member List Scraping**: User attempts `list` on `/circleInvites`. -> `PERMISSION_DENIED`.
10. **Array Overflow**: Member updates `memberIds` to 20 UIDs to bypass bounded limit. -> `PERMISSION_DENIED`.
11. **Terminal Appointment Mutation**: Non-owner member attempts to modify `appointmentDate` on a `completed` appointment. -> `PERMISSION_DENIED`.
12. **Type Poisoning on Update**: Member updates `Medication.remainingQuantity` to a string `"unlimited"`. -> `PERMISSION_DENIED`.
