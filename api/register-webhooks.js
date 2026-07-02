// api/register-webhooks.js
// Deletes ALL existing webhooks then registers ONE fresh webhook per agent board
// Visit: https://sms-app2-eight.vercel.app/api/register-webhooks?secret=adgenius2024

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

async function mondayApi(query, token) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'API-Version': '2024-10'
    },
    body: JSON.stringify({ query })
  });
  return r.json();
}

export default async function handler(req, res) {
  const secret = req.query.secret || req.headers['x-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  if (!MONDAY_TOKEN) return res.status(500).json({ error: 'MONDAY_TOKEN missing' });

  const results = [];

  for (const board of AGENT_BOARDS) {
    const boardResult = { agent: board.name, boardId: board.id, deleted: [], registered: null, status: '' };

    try {
      // STEP 1 — Get all existing webhooks for this board
      const getQuery = `{ webhooks(board_id: ${board.id}) { id board_id event } }`;
      const getData = await mondayApi(getQuery, MONDAY_TOKEN);
      const existing = getData?.data?.webhooks || [];

      // STEP 2 — Delete all existing webhooks
      for (const wh of existing) {
        const delQuery = `mutation { delete_webhook(id: ${wh.id}) { id board_id } }`;
        const delData = await mondayApi(delQuery, MONDAY_TOKEN);
        const deleted = delData?.data?.delete_webhook?.id;
        if (deleted) {
          boardResult.deleted.push(deleted);
          console.log(`🗑️ Deleted webhook ${wh.id} from ${board.name}`);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      // STEP 3 — Register ONE fresh webhook
      const regQuery = `
        mutation {
          create_webhook(
            board_id: ${board.id},
            url: "${WEBHOOK_URL}",
            event: change_column_value
          ) {
            id
            board_id
          }
        }
      `;
      const regData = await mondayApi(regQuery, MONDAY_TOKEN);
      const webhookId = regData?.data?.create_webhook?.id;

      if (webhookId) {
        boardResult.registered = webhookId;
        boardResult.status = '✅ Success';
        console.log(`✅ ${board.name} → new webhook ${webhookId}`);
      } else {
        const errMsg = regData?.errors?.[0]?.message || JSON.stringify(regData);
        boardResult.status = `❌ Failed: ${errMsg}`;
        console.log(`❌ ${board.name} → ${errMsg}`);
      }

    } catch (err) {
      boardResult.status = `❌ Error: ${err.message}`;
      console.error(`Error processing ${board.name}:`, err);
    }

    results.push(boardResult);
    await new Promise(r => setTimeout(r, 300));
  }

  const success = results.filter(r => r.status.includes('✅')).length;
  const failed = results.filter(r => r.status.includes('❌')).length;
  const totalDeleted = results.reduce((sum, r) => sum + r.deleted.length, 0);

  return res.status(200).json({
    summary: `${success} registered, ${failed} failed, ${totalDeleted} old webhooks deleted`,
    results
  });
}
