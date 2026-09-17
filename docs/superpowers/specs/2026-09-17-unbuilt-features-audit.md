# What is not built — audit and plan

**Date:** 2026-09-17
**Method:** every exported `@shop/state` hook and every `Repositories` method
cross-referenced against its callers in both apps. A capability with no caller
is a feature that exists in the layer below and has no way in.

## Findings, ranked

### 1. Nobody can change their own password — HIGH

`POST /auth/change-password` is implemented, argon2-hashed, and kills every
other session for the user. `AuthRepository.changePassword` is implemented in
both the mock and the HTTP client. **No screen in either app calls it.**

`User.mustChangePassword` is stored, defaulted, projected onto the wire by
`publicUser`, and read by nothing. `POST /users/:id/password` — the admin
handing out a credential — does not set it.

The consequence on the live system: an admin creates a user with a temporary
password, the user signs in, and there is no path by which that password can
ever change. The admin knows it permanently. This is the only finding that is a
hole in something already shipped rather than an unbuilt feature.

**Decision: build.** Change-password on both apps, plus the forced-change gate
that makes `mustChangePassword` mean something.

### 2. Permission changes apply immediately, not at next sign-in — MEDIUM

Chosen as a guardrail when roles were built, never implemented. `Principal.permissions`
is joined off the role per request; `usePermissions` derives live.

**Decision: build.** `Session.permissions` written at sign-in, read by
`principalFrom`. Paired with an explicit "sign out everyone on this role"
action, because a snapshot means a revocation does not bite for up to seven days
— the wrong lag on the day you discover someone abusing a permission.

### 3. Orders cannot be created — MEDIUM

`createOrder` and the reservation logic are implemented and exercised in the
data-layer tests. The Orders screen lists and converts to invoice; there is no
way to raise one. Reservations are therefore unreachable in the product.

**Decision: build.** A new-order dialog reusing the billing product picker.

### 4. No self-service password reset — deferred, not built

"Forgot password" needs email delivery, which means provisioning a mail
provider against a live account. That is a spending decision and a new external
dependency; not mine to make unilaterally. A super admin can already reset a
password from the platform console, so there is a manual path.

### 5. Mobile has no transfers, purchases, onboarding or administration — not a gap

Documented in the README as deliberate: desk work stays on the desk, and the
More tab says so rather than shipping half-screens. Leaving as designed.

### 6. Offline billing queue, materialised balances — not built, out of scope

Both are listed as out of scope in the README. The offline queue in particular
is a large architectural change (conflict resolution against an append-only
ledger), not a feature to slip in.

## Order of work

1. Change password + forced change — closes the live hole
2. Permission snapshot + revoke sessions — completes the roles work
3. Create order — surfaces reservations

Each ships independently. 1 and 2 touch `Session`, so they share one migration.
