export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SEMAPHORE_KEY = process.env.SEMAPHORE_KEY;
  if (!SEMAPHORE_KEY) return res.status(500).json({ error: 'SEMAPHORE_KEY missing' });

  const SENDER_NAMES = {
    'AVINICHI': 'AVINICHI',
    'COSMETIC COCOON': 'COCOON',
    'LA ROSE': 'LAROSE',
    'LAROSE CEBU': 'LRCEBU',
  };

  const { phone, message, brand } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone at message required' });

  const digits = phone.replace(/\D/g, '');
  const formatted = digits.startsWith('63') ? digits : digits.startsWith('0') ? '63' + digits.slice(1) : '63' + digits;

  try {
    const r = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: SEMAPHORE_KEY,
        number: formatted,
        message,
        sendername: SENDER_NAMES[brand] || 'CLINIC'
      })
    });
    const data = await r.json();
    const result = Array.isArray(data) ? data[0] : data;
    if (!r.ok || result?.status === 'failed') return res.status(400).json({ success: false, error: result?.message });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
