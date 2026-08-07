// api/cron-reminder.js — Vercel Cron Job
// Awtomatikong nagpapadala ng SMS reminders
// Day-before: 10AM PH (2AM UTC) — type=tomorrow
// Day-of: 8AM PH (12AM UTC) — type=today

const BOARD_ID = 9591384788;

const PAGE_MAP = {
  '0': 'LAROSE CEBU',
  '1': 'AVINICHI',
  '2': 'LA ROSE',
  '4': 'COSMETIC COCOON',
};

const SENDER_NAMES = {
  'AVINICHI':       'AVINICHI',
  'COSMETIC COCOON':'COSMECOCOON',
  'LA ROSE':        'LAROSE',
  'LAROSE CEBU':    'LaroseCebu',
};

const CLINIC_NUMBERS = {
  'LAROSE CEBU':    '09272769745',
  'AVINICHI':       '09271449686',
  'COSMETIC COCOON':'09166030147',
  'LA ROSE':        '',
};

const TEMPLATES = {
  tomorrow: 'Good morning {name}! A soft reminder that you have an appointment with us TOMORROW at {time}. Please confirm via FB page or text {clinic_number}. Thank you!',
  today:    'Good morning {name}! Just a reminder that your appointment is TODAY at {time}. We look forward to seeing you! For inquiries, text {clinic_number}. Thank You!',
};

function isTomorrow(ds) {
  if (!ds) return false;
  const d = new Date(ds); const t = new Date(); t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString();
}
function isToday(ds) {
  if (!ds) return false;
  return new Date(ds).toDateString() === new Date().toDateString();
}
function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('63')) return digits;
  if (digits.startsWith('0')) return '63' + digits.slice(1);
  return '63' + digits;
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Parse Monday date8 text ("YYYY-MM-DD HH:mm:ss") directly — NO timezone conversion.
// Vercel servers run on UTC, so new Date() + toLocaleString shifted the hour.
function parseMondayDate(ds) {
  if (!ds) return null;
  const m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return {
    year: +m[1], month: +m[2], day: +m[3],
    hour: m[4] !== undefined ? +m[4] : null,
    minute: m[5] !== undefined ? +m[5] : 0,
  };
}
function formatDate(ds) {
  const d = parseMondayDate(ds);
  if (!d) return ds || '—';
  return `${MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
}
function formatTime(ds) {
  const d = parseMondayDate(ds);
  if (!d || d.hour === null) return '';
  const ampm = d.hour >= 12 ? 'PM' : 'AM';
  let h = d.hour % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(d.minute).padStart(2, '0')} ${ampm}`;
}
// Use first name only — keeps every reminder inside 1 SMS credit (160 chars)
// and handles prefixes (Ma., Mrs.) plus Monday's "(copy)" suffix.
function firstName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const prefix = /^(ma\.?|mr\.?|mrs\.?|ms\.?|dr\.?|sr\.?|jr\.?)$/i;
  let i = 0;
  while (i < parts.length - 1 && (prefix.test(parts[i]) || parts[i].length <= 2)) i++;
  return parts[i].replace(/[(),]/g, '');
}

function fillTemplate(tpl, c) {
  const clinicNum = CLINIC_NUMBERS[c.page] || '';

  // No clinic number for this brand (e.g. LA ROSE) — drop the "text ___" clause
  let t = tpl;
  if (!clinicNum) {
    t = t
      .replace(' or text {clinic_number}', '')
      .replace(' For inquiries, text {clinic_number}.', '');
  }

  return t
    .replace(/{name}/g, firstName(c.name))
    .replace(/{brand}/g, c.page || '')
    .replace(/{date}/g, formatDate(c.apptDate))
    .replace(/{time}/g, formatTime(c.apptDate))
    .replace(/{clinic_number}/g, clinicNum);
}

async function getClients(mondayToken) {
  const query = `{
    boards(ids: [${BOARD_ID}]) {
      items_page(limit: 500) {
        items {
          id name
          column_values(ids: ["phone","status_11","date8","dup__of_lead_stage2","color_mkv7297j","color_mkvewh18"]) {
            id text value
          }
        }
      }
    }
  }`;

  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': mondayToken, 'API-Version': '2024-10' },
    body: JSON.stringify({ query })
  });
  const data = await r.json();
  return data?.data?.boards?.[0]?.items_page?.items || [];
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  const SEMAPHORE_KEY = process.env.SEMAPHORE_KEY;
  const type = req.query.type || 'tomorrow';

  if (!MONDAY_TOKEN || !SEMAPHORE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables.' });
  }

  try {
    const items = await getClients(MONDAY_TOKEN);
    const clients = items.map(item => {
      const col = {};
      item.column_values.forEach(c => col[c.id] = c);
      const apptDate = col['date8']?.text || '';
      const phone = col['phone']?.text || '';
      const apptStatus = col['status_11']?.text || '';
      const reminderSent = col['color_mkv7297j']?.text || '';
      const dayOfSent = col['color_mkvewh18']?.text || '';

      if (!phone) return null;
      if (!['For confirmation', 'Confirmed', 'For reconfirmation'].includes(apptStatus)) return null;

      if (type === 'tomorrow' && !isTomorrow(apptDate)) return null;
      if (type === 'tomorrow' && reminderSent === 'Done') return null;
      if (type === 'today' && !isToday(apptDate)) return null;
      if (type === 'today' && dayOfSent === 'Done') return null;

      let page = '';
      try {
        const v = JSON.parse(col['dup__of_lead_stage2']?.value || '{}');
        page = PAGE_MAP[String(v.index)] || '';
      } catch {}

      return { id: item.id, name: item.name, phone, apptDate, page };
    }).filter(Boolean);

    let sent = 0, failed = 0;
    for (const c of clients) {
      const msg = fillTemplate(TEMPLATES[type], c);
      const senderName = SENDER_NAMES[c.page] || 'CLINIC';
      const phone = formatPhone(c.phone);
      try {
        const smsRes = await fetch('https://api.semaphore.co/api/v4/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apikey: SEMAPHORE_KEY, number: phone, message: msg, sendername: senderName })
        });
        const smsData = await smsRes.json();
        const result = Array.isArray(smsData) ? smsData[0] : smsData;
        if (smsRes.ok && result?.status !== 'failed') { sent++; }
        else { failed++; }
      } catch { failed++; }
      await new Promise(r => setTimeout(r, 300));
    }

    return res.status(200).json({ success: true, type, sent, failed, total: clients.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
