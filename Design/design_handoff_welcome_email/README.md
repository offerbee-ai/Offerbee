# OfferBee — Welcome Email (Design Handoff)

Transactional **welcome email**, sent immediately after a new user signs up.

## Files
- `welcome-email.html` — **production-ready email template.** Table-based layout, fully inline styles, MSO conditionals, hidden preheader, mobile media query. Use this as the actual template in your email service (Resend / SendGrid / Postmark / SES).
- `OfferBee Welcome Email.dc.html` — design-review version of the same email (open in a browser to see intended rendering).
- `tokens.json` — OfferBee design tokens (Honey theme is used for email; email is always light).

## Template variables
Replace with your templating syntax if different (currently `{{var}}`):

| Variable | Purpose |
|---|---|
| `{{firstName}}` | Greeting: "Welcome, {{firstName}}." |
| `{{ctaUrl}}` | CTA button "Add your first card" — deep link into the app's add-card flow |
| `{{unsubscribeUrl}}` | Footer unsubscribe link |
| `{{settingsUrl}}` | Footer notification-settings link |
| `{{helpUrl}}` | Footer help link |

## Before sending — required
1. **Logo image**: the header references `https://offerbee.ai/email/logo@2x.png` (56×56px source, rendered 28×28). Export the OfferBee bee mark as PNG and host it — SVG is stripped by Gmail/Outlook.
2. **Subject line** suggestion: `Welcome to OfferBee — your credits start counting now`
3. **Preheader** is set in a hidden div: "Your credits start counting now. Add your first card — it takes about two minutes."

## Design spec (from tokens.json, Honey theme)
- Canvas: 600px wide, background `#FBF8F0` on desk `#E8E3D5`, border `#E8E1D2`
- Type: display = Source Serif 4 (fallback Georgia), text = Public Sans (fallback Helvetica/Arial), mono = IBM Plex Mono (fallback Courier New). Web fonts load via @import where supported; fallbacks are metric-reasonable.
- Ink `#211D16`, secondary `#6F6757`, tertiary `#9A927F`, accent `#E8680E`, accent-deep `#B4550B`, accent-soft `#FBEAD5`, separators `#ECE5D6`, footer surface `#F5F1E8`
- Structure: header (logo + "Every credit. Kept.") → hero headline (serif 32/1.15, -0.02em) → $348 stat band (accent-soft card, radius 14) → 3 numbered steps ("Two minutes to your first save") → full-width CTA button (accent, radius 12) → micro-line "Track your way · Cancel anytime" → footer (unsubscribe / settings / help)

## Client support notes
- Layout is nested `<table role="presentation">` throughout — no flex/grid.
- All styles inline except the mobile media query and font @import (progressive enhancement).
- Border-radius degrades gracefully in Outlook (square corners are acceptable).
- Dark mode: no dark variant is shipped; colors are chosen to invert acceptably in Gmail's auto-darkening.
