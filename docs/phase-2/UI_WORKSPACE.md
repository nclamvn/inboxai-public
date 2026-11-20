# Precision Workspace: UI milestone, 2026-11-20

Local only, synthetic identities and mail. No push, deployment or real mailbox.
The four product pillars, authenticated sources, approvals and recorded evidence
remain authoritative. This is an interaction and presentation upgrade, not new AI
capability or evidence of product superiority.

## Design decisions

Navy #174A72, canvas #F7F9FA, surface #FFFFFF, border #E1E7EB and text #192532.
Inter Variable with 12/14/16/24/28 px hierarchy, Lucide icons and 4 px rhythm.
Use compact semantic icon wells, text labels and straight 2 px rails. Red means
urgent or blocked; amber calls for review; teal means a transaction or verified
result; navy anchors selection. No gradients, purple, decorative AI symbols,
large tinted panels or ornamental animation.

The characteristic feature is the evidence-linked work queue within a real
mailbox: the user sees what needs a decision and can open its exact mail source.
Prominence belongs to that work, not dashboard statistics or decorative cards.

Desktop composition:

    240 px navigation | mailbox heading / search / account scope
    four pillars      | quick category filters / density
    mail folders      | action and commitment queue
    utilities         | mail list | source reading pane when selected

Mobile keeps the four pillars within reach, with Compose in the navigation and
secondary folders in an accessible modal. The reading view remains full screen. Mobile also exposes the real account selector.
The attention queue can be explicitly collapsed without modifying a commitment;
its summary counts only the loaded items and sources remain available on expansion.
Navigation icon + description distinguishes the primary destinations from folders;
mail rows separate sender, subject, source reason and category. Counts reflect
loaded mail only, never a fictional whole-mailbox total. Density changes spacing
and preview text only; it does not hide sources or change ranking.

A searchable quick-navigation dialog uses actual routes and the shared native
modal focus/escape handling. It cannot execute mail mutations. Existing Cmd/Ctrl K
continues to search mail; Cmd/Ctrl J opens quick navigation.

## References and what we take from them

Research on 2026-11-20 uses official product documentation. These observations
are descriptions of supported interaction patterns, not independent quality ratings
or claims that InboxAI matches or exceeds those products.

| Official reference | Useful pattern | InboxAI application |
| --- | --- | --- |
| [Gmail personalization](https://support.google.com/mail/answer/9259769?hl=en) | Inbox density and optional reading pane | Read a source beside its list; preserve full-screen mobile reading. |
| [Outlook layout](https://support.microsoft.com/en-gb/outlook/change-the-look-of-your-mailbox-in-outlook-com-and-outlook-on-the-web) | Focused/Other, density and reading pane control | Visible category shortcuts; a clear compact/comfortable density control. |
| [Superhuman Split Inbox](https://help.superhuman.com/hc/en-us/articles/46005636204941-Custom-Split-Inbox) | Intentional sections, counts and quick keyboard navigation | A small number of scan-friendly filters and a searchable route launcher. No custom split engine is claimed. |
| [Shortwave customization](https://www.shortwave.com/docs/guides/customize-your-shortwave-settings/) | Splits and bundles reduce context switching | Keep related commitment work together; collapse secondary information through existing explicit controls. No automatic bundling engine is added. |

## Acceptance

- Four primary destinations are visible on desktop/mobile and show correct active
  state, including nested commitment routes. All old folders remain reachable.
- Searchable route launcher opens by button/keyboard, accepts accent-free search,
  escapes safely, returns focus and performs no mutation.
- Category shortcuts use existing authenticated filters and current loaded counts.
  Compact/comfortable modes preserve urgent signals, labels, source and open actions.
- Consistent headings and content surfaces across Inbox, ledger, Ask and Operator;
  readable detail and Compose; no false verified/connected status.
- Chrome desktop, tablet, 390 px and 320 px mobile, dark mode, keyboard, 200% text
  scaling, no horizontal overflow and sampled axe checks. Viewports are not native
  simulator or physical-device evidence.
- Existing design, performance/accessibility and local-pilot four-pillar tests pass,
  together with lint, TypeScript, unit, integration, database and production build.
  Record actual failures and results in VERIFICATION.md, never predeclare PASS.

Rollback: revert this local UI change set; no schema/data migration, credential
change, LLM inference or provider mutation is required by the visual upgrade.

## Reproduce locally

`npm run test:ui-workspace` runs the four-pillar local pilot plus the new UI
acceptance using 117 synthetic Gmail messages, seven new everyday stories and
two mail accounts. It exercises real local APIs and database writes; labels and
roles are fixture-authored, not LLM accuracy evidence.

`npm run preview:local` leaves a fresh interactive build at
`http://127.0.0.1:55300/inbox` and its scenario guide at
`http://127.0.0.1:57343/`. Buyer: `mai.nguyen@example.test`, accountant:
`an.ke-toan@example.test`, password: `Synthetic-passphrase-123`. Use separate
Chrome profiles for the two roles. Loopback links work on this Mac; mobile
acceptance uses browser viewports rather than a phone on another network.

Research sources above support the interaction patterns, not a claim of superior
usability. No new AI benchmark or measured human usability study is claimed.
Actual verification and limitations are recorded in VERIFICATION.md.
