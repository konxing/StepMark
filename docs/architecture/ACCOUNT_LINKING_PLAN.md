# Secure web–WeChat account linking plan (NOT IMPLEMENTED)

## Current behavior

StepMark's email/browser sign-in and WeChat `wx.login` both create or resolve a canonical `User` via different identities. **They are not automatically linked.** If a person registers with email and independently signs in via WeChat, there may be two different `User.id` values. Both are individually isolated, but habits/notes/assistant actions will NOT automatically synchronize. This is a production UX acceptance blocker, not a cache/display error.

Never auto-merge accounts by matching a nickname, device, public IP, or guessed email. This could leak private habit diaries across users. Do not assume AI Chat Web accounts map to StepMark either.

## Proposed explicit linking workflow

1. User authenticates to the **web** account and performs recent-session / password reauthentication (or an equivalent step-up method).
2. Server issues a short-lived (5-minute) random pairing token of at least 128 bits; store ONLY its HMAC hash, owner `userId`, expiry, attempts, and unused state. Show token as QR/opaque code once, never log it or include it in persistent URLs or analytics.
3. In the mini-program, user deliberately selects **连接已有网站账户** and confirms the implications; mini-program calls official `wx.login` and sends that transient code plus the pairing token directly to StepMark's fixed HTTPS backend. AppSecret and provider tokens never appear in the client.
4. Server validates current web pairing token and independently verifies the WeChat code using code2Session. Under one transaction, bind the verified external provider subject to the intended `User`; reject any provider subject already linked to a different canonical user. Do NOT automatically delete/merge an existing WeChat-only account containing user records.
5. Return a new WeChat-kind session associated with the linked `User.id`, revoke old mobile session, and remove pairing token. Store an action audit entry. Show both web and mini that linking succeeded, with logout and unlink policy.
6. If the WeChat subject already belongs to a separate account with data, require an explicit **migration workflow** with proof of both accounts and conflict resolution. Never merge automatically in the basic link route.

## Acceptance tests before release

- Two accounts A/B cannot be linked by a token stolen from another session, expired token, replay, wrong provider subject, or brute force.
- Existing linked WeChat identity cannot be reassigned silently.
- Paired web/WeChat sessions resolve the same canonical `User.id` and return the same habits, progress, reflection notes and corrective audit entries.
- Cross-account endpoints still return 404 and do not disclose another person's titles/diaries.
- Unlinked accounts remain independent; accidental logout or device reinstall does not duplicate/migrate their data.
- All pairing requests are rate-limited, short-lived, not logged, and tested against concurrent session/token races.

**This work does not modify AI Chat Web.** Future integration will require another independent, explicit identity-link and token-audience scheme.
