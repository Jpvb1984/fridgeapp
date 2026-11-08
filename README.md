# FridgeApp

An installable web app (PWA) that tracks what is in your fridge, freezer and pantry, and what expires first. All data stays on your phone.

## What it does so far (pieces 1 to 3)

- **Quick add**: type "milk", "2 greek yogurt" or "500 g ground beef" and tap Add. The app guesses the category, location, unit and an estimated expiry date (marked with ≈). English and Spanish item names both work.
- **Edit an item**: tap it to change quantity, location, the date on the label, price and minimum stock. Your corrections are remembered next time.
- **− / +**: use or add one unit. At zero it is logged as used up.
- **Used it up / Threw it away**: logged for waste tracking (piece 4).
- **Expiring**: grouped into Expired, Today, Tomorrow, Within 3 days, This week and Later, with the money at stake.
- **Currency**: CAD by default; tap the chip at the top right to switch to USD.
- **Scan** (piece 3): photograph a receipt or a fridge shelf. Claude reads it and shows an editable list (name, quantity, unit, where it goes, price, days left) before anything is saved. Receipts are checked against their total including tax, saved for spending tracking, and a name you correct once is remembered for the next receipt. Needs your own Anthropic API key (Scan → Recognition settings).
- **Recipes**: 40 built-in home recipes ranked by what you can cook now, using food that expires soonest first. Every ingredient shows whether it is in the Fridge, Freezer or Pantry (or missing). "I cooked this" removes what you finished. Optional "More ideas with AI" invents 3 recipes from your exact inventory (uses the Scan API key).
- Works offline (except Scan and AI ideas).

## Install on iPhone

1. Open the app's address in **Safari**.
2. Tap Share, then **Add to Home Screen**.
3. Open it from the icon: it runs full screen like a native app.

## Run on a computer

```
python3 -m http.server 8765
```
then open http://localhost:8765.
