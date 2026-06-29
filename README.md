# 📱 SMS Reminder System
### Ad Genius Marketing PH — Monday.com + Semaphore

---

## Mga Files

```
sms-reminder/
├── public/
│   └── index.html          ← Yung app mismo (login + dashboard)
├── api/
│   ├── clients.js           ← Kumuha ng clients mula Monday.com
│   ├── send-sms.js          ← Magpadala ng SMS via Semaphore
│   └── cron-reminder.js     ← Auto-send araw-araw ng 10AM
├── vercel.json              ← Vercel config + cron schedule
├── package.json
└── README.md
```

---

## 🚀 Step-by-Step: Deploy sa Vercel (LIBRE)

### STEP 1 — Gumawa ng GitHub Account
1. Pumunta sa **github.com**
2. Mag-sign up ng libreng account
3. I-click ang **"New repository"**
4. Pangalanan ito ng `sms-reminder`
5. I-click ang **"Create repository"**

### STEP 2 — I-upload ang Files
1. Sa loob ng bagong repo, i-click ang **"uploading an existing file"**
2. I-drag and drop ang lahat ng files (panatilihin ang folder structure)
3. I-click ang **"Commit changes"**

### STEP 3 — Mag-sign up sa Vercel
1. Pumunta sa **vercel.com**
2. I-click ang **"Continue with GitHub"**
3. I-authorize ang Vercel sa GitHub
4. I-click ang **"Add New Project"**
5. Piliin ang `sms-reminder` na repo mo
6. I-click ang **"Deploy"**

### STEP 4 — I-set ang Environment Variables
Sa Vercel dashboard, pumunta sa:
**Settings → Environment Variables**

Dagdagan ang 3 variables na ito:

| Name | Value |
|------|-------|
| `MONDAY_TOKEN` | `eyJhbGciOiJIUzI1NiJ9.eyJ0aWQ...` (yung Monday API token mo) |
| `SEMAPHORE_KEY` | `0f5eb9796323e6b8b43c1f47abb5cca5` |
| `CRON_SECRET` | Anumang random na password, e.g. `adgenius_cron_2024` |

Pagkatapos mag-save, i-click ang **"Redeploy"**.

### STEP 5 — Tapos na! 🎉
Makukuha mo ang URL ng app mo, e.g.:
`https://sms-reminder-xxxxx.vercel.app`

**Login credentials (default):**
- Username: `admin`
- Password: `adgenius2024`

> ⚠️ **Palitan ang password** — buksan ang `public/index.html`, hanapin ang `ADMIN_PASS = 'adgenius2024'` at palitan ng sarili mong password.

---

## 🤖 Auto SMS — Paano Gumagana

Araw-araw ng **10:00 AM Philippine Time**, awtomatiko itong:
1. Kina-kuha ang lahat ng clients na may appointment **bukas**
2. Nifi-filter ang walang phone number at na-send na
3. Nagpapadala ng SMS gamit ang brand name ng client (AVINICHI, COCOON, etc.)
4. Nilo-log ang results

Hindi na kailangan pang buksan ang app — basta naka-deploy na sa Vercel, gumagana na ito.

---

## 🔧 Palitan ang Password

Buksan ang `public/index.html`, hanapin ang linyang ito:
```javascript
const ADMIN_PASS = 'adgenius2024';
```
Palitan ng mas secure na password.

---

## 📞 Support

Para sa tulong, makipag-ugnayan sa developer.
