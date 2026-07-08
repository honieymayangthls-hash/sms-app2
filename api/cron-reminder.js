export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  const SEMAPHORE_KEY = process.env.SEMAPHORE_KEY;
  const BOARD_ID = 9591384788;
  const PAGE_MAP = { '0': 'LAROSE CEBU', '1': 'AVINICHI', '2': 'LA ROSE', '4': 'COSMETIC COCOON' };
  const SENDER_NAMES = { 'AVINICHI': 'AVINICHI', 'COSMETIC COCOON': 'COSMECOCOON', 'LA ROSE': 'LAROSE', 'LAROSE CEBU': 'LaroseCebu' };

  const type = req.query.type || 'tomorrow';

  const TEMPLATES = {
    tomorrow: 'Hi {name}!\n\nJust a soft reminder of your appointment tomorrow, {date} at {time}.\nPlease confirm via our FB page.\nThank you!',
    today: 'Hi {name}!\n\nJust a reminder that your appointment is TODAY at {time}.\nWe cant wait to see your results!\n\nSee you soon!',
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
  function formatDate(ds) {
    if (!ds) return '—';
    try { return new Date(ds).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return ds; }
  }
  function formatTime(ds) {
    if (!ds) return '';
    try {
      const d = new Date(ds);
      if (isNaN(d)) return '';
      d.setHours(d.getHours() + 1);
      return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }
  function fillTemplate(tpl, c) {
    return tpl
      .replace(/{name}/g, c.name || '')
      .replace(/{brand}/g, c.page || '')
      .replace(/{date}/g, formatDate(c.apptDate))
      .replace(/{time}/g, formatTime(c.apptDate));
  }

  const query = `{
    boards(ids: [${BOARD_ID}]) {
      items_page(limit: 500) {
        items {
          id name
          column_values(ids: ["phone","status_11","date8","status_16","dup__of_lead_stage2","color_mkv7297j","color_mkvewh18"]) {
            id text value
          }
        }
      }
    }
  }`;

  try {
    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-10' },
      body: JSON.stringify({ query })
    });
    const data = await r.json();
    const items = data?.data?.boards?.[0]?.items_page?.items || [];

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
        if (smsRes.ok && result?.status !== 'failed') {
          sent++;
          console.log(`Sent ${type} reminder to ${c.name} (${phone})`);
        } else {
          failed++;
          console.log(`Failed ${type} reminder to ${c.name}: ${result?.message}`);
        }
      } catch(err) {
        failed++;
        console.log(`Error sending to ${c.name}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return res.status(200).json({ ok: true, type, sent, failed, total: clients.length });
  } catch(err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
