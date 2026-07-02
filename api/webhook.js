// api/webhook.js — Monday.com Webhook Handler
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

const BOOKING_TEMPLATE = "Hi {name},\n\nIts {agent} Your {service} using ({payment}) has been successfully reserved on {date} @ {time}.\n\nPromo Code: {promo}\n{location}\n\nIts a one-time promo. Please confirm via FB Page 1 day prior to your appointment.\n\nThank you!";

function formatDate(ds) {
  if (!ds) return '';
  try { return new Date(ds).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }); } catch(e) { return ds; }
}

function formatTime(ds) {
  if (!ds) return '';
  try {
    var d = new Date(ds);
    if (isNaN(d)) return '';
    d.setHours(d.getHours() + 1);
    return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch(e) { return ''; }
}

function formatPhone(raw) {
  var digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('63')) return digits;
  if (digits.startsWith('0')) return '63' + digits.slice(1);
  return '63' + digits;
}

function fillTemplate(c) {
  return BOOKING_TEMPLATE
    .replace(/{name}/g, c.name || '')
    .replace(/{agent}/g, c.agent || '')
    .replace(/{brand}/g, c.page || '')
    .replace(/{service}/g, c.service || '')
    .replace(/{payment}/g, c.payment || '')
    .replace(/{date}/g, formatDate(c.apptDate))
    .replace(/{time}/g, formatTime(c.apptDate))
    .replace(/{promo}/g, c.promo || '')
    .replace(/{location}/g, c.location || 'our clinic');
}

async function getItemDetails(itemId, mondayToken) {
  var query = "{ items(ids: [" + itemId + "]) { id name board { id } column_values(ids: [\"phone\",\"date8\",\"status_16\",\"dup__of_lead_stage2\",\"text_mksw348s\",\"text3\",\"text_mm4tnvws\",\"status_167\"]) { id text value } } }";
  var r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': mondayToken, 'API-Version': '2024-10' },
    body: JSON.stringify({ query: query })
  });
  var data = await r.json();
  return data && data.data && data.data.items && data.data.items[0];
}

async function sendSms(phone, message, brand, semaphoreKey) {
  var formattedPhone = formatPhone(phone);
  var senderName = SENDER_NAMES[brand] || 'CLINIC';
  var r = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: semaphoreKey, number: formattedPhone, message: message, sendername: senderName })
  });
  var data = await r.json();
  var result = Array.isArray(data) ? data[0] : data;
  return r.ok && result && result.status !== 'failed';
}

export default async function handler(req, res) {
  console.log('WEBHOOK BODY:', JSON.stringify(req.body, null, 2));

  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  var MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  var SEMAPHORE_KEY = process.env.SEMAPHORE_KEY;

  if (!MONDAY_TOKEN || !SEMAPHORE_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  var event = req.body && req.body.event;
  if (!event) return res.status(200).json({ ok: true, skipped: 'no event' });

  var boardId = event.boardId;
  var itemId = event.pulseId || event.itemId;
  var columnId = event.columnId;
  var value = event.value;

  console.log('Board: ' + boardId + ' | Item: ' + itemId + ' | Column: ' + columnId);

  if (columnId !== 'status7') {
    return res.status(200).json({ ok: true, skipped: 'not status7 - got ' + columnId });
  }

  var newStatus = (value && value.label && value.label.text) || (value && value.label) || '';
  console.log('Status: ' + newStatus);

  if (TRIGGER_STATUSES.indexOf(newStatus) === -1) {
    return res.status(200).json({ ok: true, skipped: 'status not a trigger: ' + newStatus });
  }

  var agentName = AGENT_BOARDS[String(boardId)];
  if (!agentName) {
    return res.status(200).json({ ok: true, skipped: 'not an agent board' });
  }

  try {
    var item = await getItemDetails(itemId, MONDAY_TOKEN);
    if (!item) return res.status(200).json({ ok: true, skipped: 'item not found' });

    var col = {};
    (item.column_values || []).forEach(function(c) { col[c.id] = c; });

    var phone = (col['phone'] && col['phone'].text) || '';
    if (!phone) return res.status(200).json({ ok: true, skipped: 'no phone number' });

    var apptDate = (col['date8'] && col['date8'].text) || '';
    var location = (col['status_16'] && col['status_16'].text) || '';
    var service = (col['text_mksw348s'] && col['text_mksw348s'].text) || '';
    var payment = (col['text3'] && col['text3'].text) || '';
    var promo = (col['text_mm4tnvws'] && col['text_mm4tnvws'].text) || '';

    var page = '';
    try {
      var v = JSON.parse((col['dup__of_lead_stage2'] && col['dup__of_lead_stage2'].value) || '{}');
      page = PAGE_MAP[String(v.index)] || (col['dup__of_lead_stage2'] && col['dup__of_lead_stage2'].text) || '';
    } catch(e) {}

    var client = { name: item.name, phone: phone, apptDate: apptDate, location: location, page: page, agent: agentName, service: service, payment: payment, promo: promo };

    var message = fillTemplate(client);
    var success = await sendSms(phone, message, page, SEMAPHORE_KEY);

    console.log('Webhook SMS ' + (success ? 'sent' : 'failed') + ' to ' + item.name + ' (' + phone + ') - Status: ' + newStatus + ' - Agent: ' + agentName);

    return res.status(200).json({ ok: true, success: success, client: item.name, status: newStatus, agent: agentName });
  } catch(err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true, error: err.message });
  }
}
