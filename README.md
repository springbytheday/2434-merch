# 🌸 Merch Archive — Vtuber Merchandise Tracker

A clean, minimal website to track your vtuber merchandise collection. Works fully as a static site — no backend needed.

## Features

- **Add & edit items** — Image, name, group, type, cost, status, notes
- **Filter & search** — By status, type, group, or keyword
- **Grid & table views** — Switch between card grid and compact table
- **Stats dashboard** — Total items, owned vs wishlist, total spent per currency
- **Export / Import JSON** — Download and re-upload your data any time
- **Persists in browser** — Changes are saved to localStorage automatically

---

## 🚀 Deploy to GitHub Pages

### 1. Create a GitHub repository

```bash
git init
git add .
git commit -m "init: vtuber merch tracker"
git remote add origin https://github.com/YOUR_USERNAME/merch-archive.git
git push -u origin main
```

### 2. Enable GitHub Pages

- Go to your repo → **Settings** → **Pages**
- Under **Source**, select `Deploy from a branch`
- Set branch to `main` and folder to `/ (root)`
- Click **Save**

Your site will be live at:
`https://YOUR_USERNAME.github.io/merch-archive/`

---

## 📁 File Structure

```
merch-archive/
├── index.html          ← Main page
├── css/
│   └── style.css       ← All styles
├── js/
│   └── app.js          ← All logic
├── data/
│   └── merch.json      ← Seed / default data (loaded on first visit)
└── images/             ← Optional: store images locally here
```

---

## 🗂️ Managing Your Data

### Option A — Browser (recommended for most users)
Just use the site! All changes save automatically to your browser's localStorage.
Use **Export** to download `merch.json` as a backup, and **Import** to restore it.

### Option B — Edit `data/merch.json` directly
Edit the file in your repo, then `git push`. The site loads this file only on the very first visit (before any localStorage data exists).

Each item follows this schema:

```json
{
  "id": 1,
  "name": "Hoshimachi Suisei",
  "group": "Hololive",
  "type": "Acrylic Stand",
  "status": "owned",
  "cost": 2800,
  "currency": "JPY",
  "image": "",
  "notes": "3rd Anniversary ver.",
  "dateAdded": "2024-11-10"
}
```

**status** can be `"owned"` or `"wishlist"`.

### Option C — Google Sheets (for collaborative tracking)
If you prefer Google Sheets as your source of truth:

1. Create a Google Sheet with columns: `id, name, group, type, status, cost, currency, image, notes, dateAdded`
2. Publish it as CSV: **File → Share → Publish to web → CSV format**
3. In `js/app.js`, replace the `fetch('./data/merch.json')` call with:

```javascript
fetch('YOUR_GOOGLE_SHEET_CSV_URL')
  .then(r => r.text())
  .then(csv => {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');
    allItems = lines.slice(1).map((line, i) => {
      const vals = line.split(',');
      return Object.fromEntries(headers.map((h, j) => [h.trim(), vals[j]?.trim() || '']));
    });
    render();
  });
```

> Note: Images stored as base64 in localStorage will not sync to Sheets. For Sheets, use public image URLs instead.

---

## Item Types Supported

- Acrylic Stand
- Cheki Card
- Plushie
- Tapestry
- Keychain
- Pin Badge
- Trading Card
- Fan Book
- Voice Pack
- Other

---

## License

MIT — personal use, feel free to customize!
