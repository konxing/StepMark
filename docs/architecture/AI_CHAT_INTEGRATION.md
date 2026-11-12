# StepMark chat-first interaction design / AI Chat Web integration boundary

## Objective

Make **conversation** the default path to populate habit records and ask for results on web and mobile. Form UI remains an escape hatch for advanced correction and use without a configured LLM. This is a bounded-action assistant, **not** open SQL access or a scientifically validated ability scorer.

Current flow:

`User's explicit message + opt-in → POST /api/v1/assistant → authenticated principal + origin validation + rate limit → fixed-host LLM JSON plan → strict schema + independent evidence/ownership checks → transactional, user-scoped ORM mutation + one-use receipt → short server-grounded response → refresh owner-scoped UI`

Only the message and the list of the user's **habit IDs and titles** are supplied to the LLM (no full diary history, email, passwords, sessions, ability data or other users' records). The model can propose at most one supported intent per request; an explicit completion report can also store an AI-only note when supported by an exact user quote. It cannot auto-update latent capability estimates.

## Backend commands (v1)

| Intent | Requires | Server behavior | When not safe |
|---|---|---|---|
| `create_habit` | Explicitly establish a concrete routine; title and action | Create current user's habit if unique/new | Question, unclear action or quota → ask |
| `record_opportunity` | Existing owned habit; explicit done/missed/no-cue statement; today/yesterday only | Save one daily opportunity; optionally AI-coded note | Mismatched date, guessed target/status, conflicting previous record → ask / safe conflict |
| `record_reflection` | Explicitly described feeling associated with owned habit | Save user's verbatim feeling, optional quoted, confidence-gated AI interpretation | No natural-start evidence → retain words but no numeric self-rating |
| `check_progress` | Existing owned habit | Query deterministic aggregates, never generated numbers | Unknown habit → ask |
| `chat` / `clarify` | No writes | Ephemeral reply / clarification | No transcript stored |

Automaticity classification is **AI_ASSISTED**, not SELF_REPORT: the former goes in `aiLevel` and retains the prompt version, model ID, confidence and verbatim quote. The server never writes a model-inferred value into `initiationLevel`, nor directly changes `AbilityEstimate`.

## Network and input limits

Request schema: `{message: string(2..600), requestId: UUID, localDate: YYYY-MM-DD, consentToAI: true}`, strict bounded JSON. For WeChat, `wx.request` uses POST and the 24-hour bearer session; web uses the HttpOnly session cookie with same-origin mutation validation. The local date is accepted only within a bounded window of the server clock to avoid backdating/future entries.

- 30 AI chat requests per account per hour, database-backed limit.
- Provider domain is **fixed** to OpenAI or OpenRouter; outbound host/path is not user-controlled (SSRF boundary).
- 12-second provider timeout, bounded response size, strict JSON output. No arbitrary tool execution, no SQL generation, no direct userId from model.
- Duplicate chat write retries use a per-user `(userId,requestId)` unique constraint, one transaction, and an HMAC digest of the request message. Consistency requires the digest secret to remain stable across deployed app replicas.
- `AssistantAction` stores limited operation receipts only, not the original user message. It expires after 30 days **only if the separate prune scheduler is actually enabled**. Ordinary chat replies are not persisted. The app frontend currently holds up to 16 temporary chat bubbles and does not automatically sync history.

## Privacy and product controls

The AI consent switch defaults OFF, and selecting it explicitly authorizes outbound transfer of that message and existing habit titles. It can be switched OFF again at any time. Earlier transmissions cannot be retroactively recalled. Users can still record/inspect through manual controls. Model-free or provider-failed cases display an error instead of generating fake answers.

The Web and Mini Program **do not** receive the AI provider API key. The same canonical account identity must be confirmed by existing session middleware; the planned integration with `ai-chat-web` must use an explicit linked identity/authorization design and never silently merge WeChat and email accounts.

## Performance and display verification

Chat is one bounded model request + a handful of indexed/owner-scoped DB queries; no LLM is invoked when loading the dashboard. Mobile has a bounded scroll-view for messages, rpx layout, minimum tap area, text wrap and safe-area padding. New structural CI tests check core data bindings and WXML nesting.

This is a **code-level**, not screenshot-level claim. Before enabling the public mini-program: use WeChat Developer Tools + iOS and Android physical devices to validate 320/375/430 CSS-pixel widths, font scaling, safe-area, keyboard overlap, loading/failure states, long answers, date rollover, and actual data synchronization across two clients. See `MOBILE_QA.md`.

## Future connection to AI Chat Web

Expose this bounded `assistant-command` intent validator and transactional executor behind an authenticated internal API. Reuse it when AI Chat Web is linked via explicit account consent. The chat app should supply *user text*, not direct database credentials or arbitrary SQL. Keep separate services/users until identity-link, data visibility, revocation and replay semantics are reviewed. **No changes have been made to AI Chat Web.**
