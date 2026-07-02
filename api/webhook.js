// api/webhook.js — Monday.com Webhook Handler
// Triggered when agent changes status to "Scheduled" or "Rescheduled"
// Automatically sends Booking Confirmation SMS to client

const TRIGGER_STATUSES = ['Scheduled', 'Rescheduled'];

const AGENT_BOARDS = {
  '9692100711':  'Earl',
  '9692108190':  'Ria',
  '9692125478':  'Sharlene',
  '9993525271':  'Paulo',
  '9692105137':  'Denmark',
  '9692104460':  'Red',
  '9692098753':  'Isha',
  '9692097734':  'Tricia',
  '9692102314':  'Jonie',
  '18403437923': 'Vhan',
  '18390156935': 'Piolo',
  '18393858367': 'Jess',
  '18402652963': 'Arny',
  '18404006348': 'Rizza',
  '9591642884':  'MJ',
  '18420275367': 'Gazel',
};

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
  'LAROSE CEBU':    'LRCEBU',
};

const BOOKING_TEMPLATE = 'Hi {name}\nThis is {agent} from {brand}!\nYour {service} using ({payment})\nhas been successfully reserved for you on {date} @ {time}\n\nPromo Code: {promo}\n{location}\n\nThis is a one-time promo.\nPlease confirm 1 day prior to your appointment.\nFor inquiries, message us on our FB Page\n\nThank you!';

function formatDate(ds) {
  if (!ds) return '—';
  try { return new Date(ds).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return ds; }
}
function formatTime(ds) {
  if (!ds) return '';
  try { const d = new Date(ds); return isNaN(d) ? '' : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('63')) return digits;
  if (digits.startsWith('0')) return '63' + digits.slice(1);
  return '63' + digits;
}
function fillTemplate(c) {
  const loc = (c.location || '').split('-').pop()?.trim() || 'our clinic';
  return BOOKING_TEMPLATE
    .replace(/{name}/g, c.name || '')
    .replace(/{agent}/g, c.agent || '')
    .replace(/{brand}/g, c.page || '')
    .replace(/{service}/g, c.service || '')
    .replace(/{payment}/g, c.payment || '')
    .replace(/{date}/g, formatDate(c.apptDate))
    .replace(/{time}/g, formatTime(c.apptDate))
    .replace(/{promo}/g, c.promo || '')
    .replace(/{location}/g, loc);
}

async function getItemDetails(itemId, mondayToken) {
  const query = `{
    items(ids: [${itemId}]) {
      id name
      board { id }
      column_values(ids: ["phone","date8","status_16","dup__of_lead_stage2","text_mkswdnmm","text3","text_mm4swazy","status_167"]) {
        id text value
      }
    }
  }`;

  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': mondayToken, 'API-Version': '2024-10' },
    body: JSON.stringify({ query })
  });
  const data = await r.json();
  return data?.data?.items?.[0];
}

async function sendSms(phone, message, brand, semaphoreKey) {
  const formattedPhone = formatPhone(phone);
  const senderName = SENDER_NAMES[brand] || 'CLINIC';
  const r = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: semaphoreKey, number: formattedPhone, message, sendername: senderName })
  });
  const data = await r.json();
  const result = Array.isArray(data) ? data[0] : data;
  return r.ok && result?.status !== 'failed';
}

export default async function handler(req, res) {
  // Monday.com sends a challenge for webhook verification
  if (req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  const SEMAPHORE_KEY = process.env.SEMAPHORE_KEY;

  if (!MONDAY_TOKEN || !SEMAPHORE_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const event = req.body?.event;
  if (!event) return res.status(200).json({ ok: true, skipped: 'no event' });

  const { boardId, itemId, columnId, value } = event;

  // Only process status7 column changes
  if (columnId !== 'status7') {
    return res.status(200).json({ ok: true, skipped: 'not status7' });
  }

  // Only trigger on Scheduled or Rescheduled
  const newStatus = value?.label?.text || '';
  if (!TRIGGER_STATUSES.includes(newStatus)) {
    return res.status(200).json({ ok: true, skipped: `status "${newStatus}" not a trigger` });
  }

  // Check if this board is one of our agent boards
  const agentName = AGENT_BOARDS[String(boardId)];
  if (!agentName) {
    return res.status(200).json({ ok: true, skipped: 'not an agent board' });
  }

  try {
    // Fetch item details
    const item = await getItemDetails(itemId, MONDAY_TOKEN);
    if (!item) return res.status(200).json({ ok: true, skipped: 'item not found' });

    const col = {};
    (item.column_values || []).forEach(c => col[c.id] = c);

    const phone = col['phone']?.text || '';
    if (!phone) return res.status(200).json({ ok: true, skipped: 'no phone number' });

    const apptDate = col['date8']?.text || '';
    const location = col['status_16']?.text || '';
    const service = col['text_mkswdnmm']?.text || '';
    const payment = col['text3']?.text || '';
    const promo = col['text_mm4swazy']?.text || '';

    let page = '';
    try {
      const v = JSON.parse(col['dup__of_lead_stage2']?.value || '{}');
      page = PAGE_MAP[String(v.index)] || col['dup__of_lead_stage2']?.text || '';
    } catch {}

    const client = {
      name: item.name,
      phone,
      apptDate,
      location,
      page,
      agent: agentName,
      service,
      payment,
      promo,
    };

    const message = fillTemplate(client);
    const success = await sendSms(phone, message, page, SEMAPHORE_KEY);

    console.log(`Webhook SMS ${success ? 'sent' : 'failed'} to ${item.name} (${phone}) — Status: ${newStatus} — Agent: ${agentName}`);

    return res.status(200).json({ ok: true, success, client: item.name, status: newStatus, agent: agentName });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true, error: err.message });
  }
}
