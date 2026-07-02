// api/register-webhooks.js
// Run this ONCE to register webhooks for all agent boards
// Visit: https://sms-app2-eight.vercel.app/api/register-webhooks
// (Admin only - protected by CRON_SECRET)

const AGENT_BOARDS = [
  { id: '9692100711',  name: 'Earl' },
  { id: '9692108190',  name: 'Ria' },
  { id: '9692125478',  name: 'Sharlene' },
  { id: '9993525271',  name: 'Paulo' },
  { id: '9692105137',  name: 'Denmark' },
  { id: '9692104460',  name: 'Red' },
  { id: '9692098753',  name: 'Isha' },
  { id: '9692097734',  name: 'Tricia' },
  { id: '9692102314',  name: 'Jonie' },
  { id: '18403437923', name: 'Vhan' },
  { id: '18390156935', name: 'Piolo' },
  { id: '18393858367', name: 'Jess' },
  { id: '18402652963', name: 'Arny' },
  { id: '18404006348', name: 'Rizza' },
  { id: '9591642884',  name: 'MJ' },
  { id: '18420275367', name: 'Gazel' },
];

const WEBHOOK_URL = 'https://sms-app2-eight.vercel.app/api/webhook';

export default async function handler(req, res) {
  // Security check
  const secret = req.query.secret || req.headers['x-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — add ?secret=YOUR_CRON_SECRET to URL' });
  }

  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  if (!MONDAY_TOKEN) return res.status(500).json({ error: 'MONDAY_TOKEN missing' });

  const results = [];

  for (const board of AGENT_BOARDS) {
    const mutation = `
      mutation {
        create_webhook(
          board_id: ${board.id},
          url: "${WEBHOOK_URL}",
          event: change_column_value,
          
        ) {
          id
          board_id
        }
      }
    `;

    try {
      const r = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': MONDAY_TOKEN,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: mutation })
      });

      const data = await r.json();
      const webhookId = data?.data?.create_webhook?.id;

      if (webhookId) {
        results.push({ agent: board.name, boardId: board.id, webhookId, status: '✅ Success' });
        console.log(`✅ ${board.name} (${board.id}) → webhook ${webhookId}`);
      } else {
        const errMsg = data?.errors?.[0]?.message || 'Unknown error';
        results.push({ agent: board.name, boardId: board.id, status: '❌ Failed', error: errMsg });
        console.log(`❌ ${board.name} (${board.id}) → ${errMsg}`);
      }
    } catch (err) {
      results.push({ agent: board.name, boardId: board.id, status: '❌ Error', error: err.message });
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  const success = results.filter(r => r.status.includes('✅')).length;
  const failed = results.filter(r => r.status.includes('❌')).length;

  return res.status(200).json({
    summary: `${success} registered, ${failed} failed`,
    results
  });
}
