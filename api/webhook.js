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
  'LAROSE CEBU':    'LaroseCebu',
};

const CLINIC_NUMBERS = {
  'LAROSE CEBU':    '09272769745',
  'AVINICHI':       '09271449686',
  'COSMETIC COCOON':'09166030147',
  'LA ROSE':        '',
};

// Promo Code column ID is DIFFERENT per agent board
const PROMO_COLUMNS = {
  '9692100711':  'text_mm4tcm0w', // Earl
  '9692108190':  'text_mm4ta6xg', // Ria
  '9692125478':  'text_mm4th5td', // Sharlene
  '9993525271':  'text_mm4td8b9', // Paulo
  '9692105137':  'text_mm4tx4aa', // Denmark
  '9692104460':  'text_mm4tzhvz', // Red
  '9692098753':  'text_mm4tn81h', // Isha
  '9692097734':  'text_mm4t8j9n', // Tricia
  '9692102314':  'text_mm4t5hhz', // Jonie
  '18403437923': 'text_mm4tm156', // Vhan
  '18393858367': 'text_mm4t5jsn', // Jess
  '18402652963': 'text_mm4t545d', // Arny
  '18404006348': 'text_mm4tnvws', // Rizza
  '9591642884':  'text_mm4tcvyn', // MJ
  '18420275367': 'text_mm4t5jsn', // Gazel
};

const BOOKING_TEMPLATE = 'Hi {name}! Its {agent}. Your {service} via {payment} is booked on {date} @ {time}.\n\nPromo: {promo}\n{location}\n\nOne-time promo. Please confirm via FB Page or text {clinic_number} 1 day before. Thank you!';

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

function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('63')) return digits;
  if (digits.startsWith('0')) return '63' + digits.slice(1);
  return '63' + digits;
}
// Use first name only — keeps the message from spilling into an extra SMS credit.
// Handles prefixes (Ma., Mrs.) and Monday's "(copy)" suffix.
function firstName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const prefix = /^(ma\.?|mr\.?|mrs\.?|ms\.?|dr\.?|sr\.?|jr\.?)$/i;
  let i = 0;
  while (i < parts.length - 1 && (prefix.test(parts[i]) || parts[i].length <= 2)) i++;
  return parts[i].replace(/[(),]/g, '');
}

function fillTemplate(c) {
  const loc = c.location || 'our clinic';
  const clinicNum = CLINIC_NUMBERS[c.page] || '';

  // No clinic number for this brand (e.g. LA ROSE) — drop the "or text ___" clause
  const tpl = clinicNum
    ? BOOKING_TEMPLATE
    : BOOKING_TEMPLATE.replace(' or text {clinic_number}', '');
  let out = tpl
    .replace(/{name}/g, firstName(c.name))
    .replace(/{agent}/g, c.agent || '')
    .replace(/{brand}/g, c.page || '')
    .replace(/{service}/g, c.service || '')
    .replace(/{payment}/g, c.payment || '')
    .replace(/{date}/g, formatDate(c.apptDate))
    .replace(/{time}/g, formatTime(c.apptDate))
    .replace(/{promo}/g, c.promo || '')
    .replace(/{location}/g, loc)
    .replace(/{clinic_number}/g, clinicNum);

  // Clean up if promo code is empty — remove the dangling "Promo:" line
  out = out.replace(/\nPromo:\s*(?=\n)/, '');

  return out;
}

async function getItemDetails(itemId, mondayToken, promoCol) {
  const promo = promoCol || 'text_mm4tnvws';
  const query = `{
    items(ids: [${itemId}]) {
      id name
      board { id }
      column_values(ids: ["phone","date8","status_16","dup__of_lead_stage2","text_mksw348s","text3","${promo}"]) {
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
  const ok = r.ok && result?.status !== 'failed';
  if (!ok) {
    console.error(`SEMAPHORE FAILED — Brand: "${brand}" — Sender: "${senderName}" — Response: ${JSON.stringify(data)}`);
  }
  return ok;
}

export default async function handler(req, res) {
  // Monday.com webhook verification challenge
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

  const { boardId, pulseId, itemId, columnId, value } = event;
  const realItemId = pulseId || itemId;

  // DIAGNOSTIC: log every incoming event so we can see what Monday is sending
  console.log(`EVENT — Board: ${boardId} | Item: ${realItemId} | Column: ${columnId} | Status: ${value?.label?.text || '(none)'}`);

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
    const promoCol = PROMO_COLUMNS[String(boardId)];
    const item = await getItemDetails(realItemId, MONDAY_TOKEN, promoCol);
    if (!item) return res.status(200).json({ ok: true, skipped: 'item not found' });

    const col = {};
    (item.column_values || []).forEach(c => col[c.id] = c);

    const phone = col['phone']?.text || '';
    if (!phone) return res.status(200).json({ ok: true, skipped: 'no phone number' });

    const apptDate = col['date8']?.text || '';
    const location = col['status_16']?.text || '';
    const service = col['text_mksw348s']?.text || '';
    const payment = col['text3']?.text || '';
    const promo = col[promoCol]?.text || '';

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

    console.log(`Webhook SMS ${success ? 'sent' : 'failed'} to ${item.name} (${phone}) — Status: ${newStatus} — Agent: ${agentName} — RawDate: "${apptDate}" → "${formatDate(apptDate)} @ ${formatTime(apptDate)}" — Brand: ${page} — Sender: ${SENDER_NAMES[page] || 'CLINIC'}`);

    return res.status(200).json({ ok: true, success, client: item.name, status: newStatus, agent: agentName });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true, error: err.message });
  }
}
