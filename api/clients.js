export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  if (!MONDAY_TOKEN) return res.status(500).json({ error: 'MONDAY_TOKEN missing' });

  const BOARD_ID = 9591384788;
  const PAGE_MAP = { '0': 'LAROSE CEBU', '1': 'AVINICHI', '2': 'LA ROSE', '4': 'COSMETIC COCOON' };

  const query = `{
    boards(ids: [${BOARD_ID}]) {
      items_page(limit: 500) {
        items {
          id name
          column_values(ids: ["phone","status_11","date8","status_16","dup__of_lead_stage2","color_mkv7297j","status_167","text_mkswdnmm","text3","text_mm4swazy"]) {
            id text value
          }
        }
      }
    }
  }`;

  try {
    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': MONDAY_TOKEN,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query })
    });

    const data = await r.json();
    if (data.errors) return res.status(500).json({ error: data.errors[0].message });

    const items = data?.data?.boards?.[0]?.items_page?.items || [];
    const today = new Date().toDateString();
    const tomorrow = new Date(Date.now() + 86400000).toDateString();

    const clients = items.map(item => {
      const col = {};
      item.column_values.forEach(c => col[c.id] = c);
      const apptDate = col['date8']?.text || '';
      if (!apptDate) return null;
      const d = new Date(apptDate).toDateString();
      if (d !== today && d !== tomorrow) return null;
      let page = '';
      try {
        const v = JSON.parse(col['dup__of_lead_stage2']?.value || '{}');
        page = PAGE_MAP[String(v.index)] || col['dup__of_lead_stage2']?.text || '';
      } catch {}
      return {
        id: item.id,
        name: item.name,
        phone: col['phone']?.text || '',
        apptStatus: col['status_11']?.text || '',
        apptDate,
        location: col['status_16']?.text || '',
        page,
        agent: col['status_167']?.text || '',
        service: col['text_mkswdnmm']?.text || '',
        payment: col['text3']?.text || '',
        promo: col['text_mm4swazy']?.text || '',
        smsStatus: col['color_mkv7297j']?.text === 'Done' ? 'Sent' : 'Pending'
      };
    }).filter(Boolean);

    return res.status(200).json(clients);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
