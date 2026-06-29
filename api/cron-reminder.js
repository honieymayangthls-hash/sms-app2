// api/cron-reminder.js — Vercel Cron Job
// Awtomatikong nagpapadala ng SMS sa lahat ng clients na may appointment BUKAS
// Nag-ri-run araw-araw ng 10:00 AM Philippine Time (2:00 AM UTC)

const BOARD_ID = 9591384788;

const PAGE_MAP = {
  '0': 'LAROSE CEBU',
  '1': 'AVINICHI',
  '2': 'LA ROSE',
  '4': 'COSMETIC COCOON',
};

const SENDER_NAMES = {
  'AVINICHI': 'AVINICHI',
  'COSMETIC COCOON': 'COCOON',
  'LA ROSE': 'LAROSE',
  'LAROSE CEBU': 'LRCEBU',
};

const SMS_TEMPLATE = 'Hi {name}! Paalala lang na mayroon kang appointment sa {brand} bukas, {date} ng {time}. Pakiconfirm ang iyong attendance. Para sa katanungan, makipag-ugnayan sa aming clinic. — {brand} Team';

function isTomorrow(ds) {
  if (!ds) return false;
  const d = new Date(ds);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString();
}

function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('63')) return digits;
  if (digits.startsWith('0')) return '63' + digits.slice(1);
  return '63' + digits;
}

function formatDate(ds) {
  if (!ds) return '—';
  try { return new Date(ds).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }); }
  catch { return ds; }
}

function formatTime(ds) {
  if (!ds) return '';
  try {
    const d = new Date(ds);
    return isNaN(d) ? '' : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function fillTemplate(client) {
  const loc = (client.location || '').split('-').pop()?.trim() || 'aming clinic';
  return SMS_TEMPLATE
    .replace(/{name}/g, client.name || '')
    .replace(/{brand}/g, client.page || '')
    .replace(/{date}/g, formatDate(client.apptDate))
    .replace(/{time}/g, formatTime(client.apptDate))
    .replace(/{location}/g, loc);
}

async function getClients(mondayToken) {
  const query = `{
    boards(ids: [${BOARD_ID}]) {
      items_page(limit: 500) {
        items {
          id name
          column_values(ids: ["phone","status_11","date8","status_16","dup__of_lead_stage2","color_mkv7297j"]) {
            id text value
          }
        }
      }
    }
  }`;

  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': mondayToken, 'API-Version': '2024-10' },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  const items = data?.data?.boards?.[0]?.items_page?.items || [];

  return items.map(item => {
    const colMap = {};
    (item.column_values || []).forEach(cv => { colMap[cv.id] = cv; });

    const phone = colMap['phone']?.text || '';
    const apptStatus = colMap['status_11']?.text || '';
    const apptDate = colMap['date8']?.text || '';
    const location = colMap['status_16']?.text || '';
    const reminderText = colMap['color_mkv7297j']?.text || '';

    let page = '';
    try {
      const raw = colMap['dup__of_lead_stage2']?.value;
      if (raw) {
        const parsed = JSON.parse(raw);
        const idx = parsed?.index !== undefined ? String(parsed.index) : '';
        page = PAGE_MAP[idx] || colMap['dup__of_lead_stage2']?.text || '';
      }
    } catch {}

    // Patok lang yung may appointment bukas at hindi pa naka-send
    if (!isTomorrow(apptDate)) return null;
    if (reminderText === 'Done') return null; // Skip na — na-send na
    if (!phone) return null; // Skip — walang phone
    if (!['For confirmation','Confirmed','For reconfirmation'].includes(apptStatus)) return null;

    return { id: item.id, name: item.name, phone, apptStatus, apptDate, location, page };
  }).filter(Boolean);
}

async function sendSms(client, semaphoreKey) {
  const phone = formatPhone(client.phone);
  const message = fillTemplate(client);
  const senderName = SENDER_NAMES[client.page] || 'CLINIC';

  const res = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: semaphoreKey, number: phone, message, sendername: senderName }),
  });

  const data = await res.json();
  const result = Array.isArray(data) ? data[0] : data;
  return result?.status !== 'failed' && res.ok;
}

export default async function handler(req, res) {
  // Security: Vercel lang ang pwedeng mag-call ng cron
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  const SEMAPHORE_KEY = process.env.SEMAPHORE_KEY;

  if (!MONDAY_TOKEN || !SEMAPHORE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables.' });
  }

  try {
    console.log('🕐 Cron started — fetching tomorrow\'s clients...');
    const clients = await getClients(MONDAY_TOKEN);
    console.log(`📋 ${clients.length} clients to remind.`);

    let sent = 0, failed = 0;
    for (const client of clients) {
      const success = await sendSms(client, SEMAPHORE_KEY);
      if (success) { sent++; console.log(`✅ Sent to ${client.name} (${client.phone})`); }
      else { failed++; console.log(`❌ Failed: ${client.name} (${client.phone})`); }
      await new Promise(r => setTimeout(r, 300)); // Rate limit
    }

    console.log(`✅ Done! ${sent} sent, ${failed} failed.`);
    return res.status(200).json({ success: true, sent, failed, total: clients.length });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
