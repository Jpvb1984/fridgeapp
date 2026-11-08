# Decisions

- **Platform**: PWA first (confirmed by Jose on 2026-11-04). App Store later via Capacitor.
- **Language and currency**: English UI (Jose's request, 2026-11-04). CAD by default with a one-tap switch to USD; amounts formatted for en-CA / en-US.
- **Data**: browser localStorage, single device. Persistent storage is requested so Safari does not evict it.
- **Estimated expiry**: shelf life in days per category (foods.js). Items put in the freezer get 120 days. Always marked ≈ until you enter the real date.
- **"Soon"** = within 3 days. The tab badge counts expired items plus those within 3 days.
- **Each purchase is its own batch**: two milks with different dates are listed separately.
- **Decimals**: number fields accept both "4.50" and "4,50".
- **Alerts**: in-app for now (badge and banner). Push notifications later; on iPhone they only work once the app is on the Home Screen (iOS 16.4+).
- **Scan**: photos go straight from the phone to the Anthropic API with the user's key (no server). Model claude-opus-5-5 with a JSON schema answer and server-side fallback on refusals. Images downscaled to 1568 px. The user always reviews before saving; non-food lines are unticked; low-confidence items are flagged.
- **Receipt total check**: lines + tax/fees must equal the printed total, otherwise the gap is shown.
- **Learning**: corrected receipt line names are stored as aliases keyed by the printed text.
- **Recipes**: built-in book (recipes-data.js) matched by keywords, so it works offline and free. Shown only when at most one required ingredient is missing. Processed foods (sauce, soup, paste) do not count as the fresh ingredient. Cookidoo link is a web search, since Cookidoo has no public API.
