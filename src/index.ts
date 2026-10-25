/**
 * Tribyu Database - Cloudflare Worker backed by D1.
 *
 * Read API (used by the Tribyu Tracker front end), all GET + JSON:
 *   /get-channel-data  /get-payment-data  /get-auction-data  /get-ah-history  /get-current-metrics
 * Download routes (/download-*) return the same tables as .json files, and `/` serves a small admin page.
 *
 * The /log-* routes were the ingestion side: they pulled prize pool, hashrate and auction
 * messages from Discord and wrote them to D1. They need a `USER_TOKEN` secret and are disabled
 * now that the project is archived, so the stored data is a frozen snapshot.
 */

interface ChannelData {
  prizePool: string;
  hashrate: string;
  timestamp: string;
}

interface CurrentMetrics {
  prizePool: string;
  hashrate: string;
  lastUpdated: string;
}

interface PaymentData {
  messagesFetched: number;
  newEntries: number;
  error?: string;
}

interface AuctionData {
  username: string;
  item: string;
  quantity: number;
  price: string;
  timestamp: string;
  item_id: string;
}

interface AhHistoryData {
  seller: string;
  buyer: string;
  item: string;
  quantity: number;
  price: string;
  timestamp: string;
}

interface Env {
  DB: D1Database;
  USER_TOKEN: string;
}

const CHANNEL_DATA_TABLE = 'channel_data';
const PAYMENT_DATA_TABLE = 'payment_data';
const AUCTION_HOUSE_TABLE = 'auction_house';
const AH_HISTORY_TABLE = 'ah_history';
const CURRENT_METRICS_TABLE = 'current_metrics';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed. Use GET.', {
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        status: 405,
      });
    }

    try {
      const url = new URL(request.url);
      let response: Response;

      if (url.pathname.startsWith('/log-') && !env.USER_TOKEN) {
        return new Response('Ingestion is disabled: USER_TOKEN is not set.', {
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
          status: 503,
        });
      }

      if (url.pathname === '/log-data') {
        const values = await getAndWritePrizePoolAndHashrate(env);
        response = new Response(
          `<h2>PP and HR Logged Successfully!</h2><p>Prize: ${values.prizePool}, Hashrate: ${values.hashrate}</p>`,
          { headers: { 'Content-Type': 'text/html', ...corsHeaders }, status: 200 }
        );
      } else if (url.pathname === '/log-payments') {
        const result = await processPrizePoolRewardsLastHour(env);
        if (result.error) {
          console.error('Payment processing failed:', result.error);
          response = new Response(`Error processing payments: ${result.error}`, {
            headers: { 'Content-Type': 'text/plain', ...corsHeaders },
            status: 500,
          });
        } else {
          response = new Response(
            `<h2>All Payments Processed Successfully</h2><p>Processed ${result.messagesFetched} entries, added ${result.newEntries} new entries.</p>`,
            { headers: { 'Content-Type': 'text/html', ...corsHeaders }, status: 200 }
          );
        }
      } else if (url.pathname === '/log-auction-data') {
        const values = await fetchAndWriteAuctionData(env);
        response = new Response(
          `<h2>Auction Data Logged Successfully!</h2><p>Processed ${values.length} auction entries.</p>`,
          { headers: { 'Content-Type': 'text/html', ...corsHeaders }, status: 200 }
        );
      } else if (url.pathname === '/log-ah-history') {
        const values = await fetchAndWriteAhHistory(env);
        response = new Response(
          `<h2>AH History Data Logged Successfully!</h2><p>Processed ${values.length} history entries.</p>`,
          { headers: { 'Content-Type': 'text/html', ...corsHeaders }, status: 200 }
        );
      } else if (url.pathname === '/get-channel-data') {
        const result = await env.DB.prepare(`SELECT * FROM ${CHANNEL_DATA_TABLE} ORDER BY timestamp DESC`).all();
        response = new Response(JSON.stringify(result.results), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 200,
        });
      } else if (url.pathname === '/get-payment-data') {
        const result = await env.DB.prepare(`SELECT * FROM ${PAYMENT_DATA_TABLE} ORDER BY timestamp DESC`).all();
        response = new Response(JSON.stringify(result.results), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 200,
        });
      } else if (url.pathname === '/get-auction-data') {
        const result = await env.DB.prepare(`SELECT * FROM ${AUCTION_HOUSE_TABLE} ORDER BY timestamp DESC`).all();
        response = new Response(JSON.stringify(result.results), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 200,
        });
      } else if (url.pathname === '/get-ah-history') {
        const result = await env.DB.prepare(`SELECT * FROM ${AH_HISTORY_TABLE} ORDER BY timestamp DESC`).all();
        response = new Response(JSON.stringify(result.results), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 200,
        });
      } else if (url.pathname === '/get-current-metrics') {
        const result = await env.DB.prepare(`SELECT * FROM ${CURRENT_METRICS_TABLE} ORDER BY last_updated DESC LIMIT 1`).all();
        response = new Response(JSON.stringify(result.results), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 200,
        });
      } else if (url.pathname === '/download-channel-data') {
        const result = await env.DB.prepare(`SELECT * FROM ${CHANNEL_DATA_TABLE} ORDER BY timestamp DESC`).all();
        const filename = `channel_data_${new Date().toISOString().split('T')[0]}.json`;
        response = new Response(JSON.stringify(result.results, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`,
            ...corsHeaders
          },
          status: 200,
        });
      } else if (url.pathname === '/download-payment-data') {
        const result = await env.DB.prepare(`SELECT * FROM ${PAYMENT_DATA_TABLE} ORDER BY timestamp DESC`).all();
        const filename = `payment_data_${new Date().toISOString().split('T')[0]}.json`;
        response = new Response(JSON.stringify(result.results, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`,
            ...corsHeaders
          },
          status: 200,
        });
      } else if (url.pathname === '/download-auction-data') {
        const result = await env.DB.prepare(`SELECT * FROM ${AUCTION_HOUSE_TABLE} ORDER BY timestamp DESC`).all();
        const filename = `auction_data_${new Date().toISOString().split('T')[0]}.json`;
        response = new Response(JSON.stringify(result.results, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`,
            ...corsHeaders
          },
          status: 200,
        });
      } else if (url.pathname === '/download-ah-history') {
        const result = await env.DB.prepare(`SELECT * FROM ${AH_HISTORY_TABLE} ORDER BY timestamp DESC`).all();
        const filename = `ah_history_${new Date().toISOString().split('T')[0]}.json`;
        response = new Response(JSON.stringify(result.results, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`,
            ...corsHeaders
          },
          status: 200,
        });
      }
      else {
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord D1 Database</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 20px auto;
      padding: 20px;
    }
    h1 {
      text-align: center;
      color: #333;
    }
    .section {
      margin-bottom: 30px;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 5px;
    }
    .section h2 {
      margin-top: 0;
      color: #555;
    }
    button {
      background-color: #4CAF50;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin: 5px;
      font-size: 14px;
    }
    button:hover {
      background-color: #45a049;
    }
    .status {
      margin-top: 10px;
      padding: 10px;
      border-radius: 4px;
      display: none;
    }
    .success {
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .error {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
  </style>
</head>
<body>
  <h1>Discord D1 Database Management</h1>

  <div class="section">
    <h2>Data Logging</h2>
    <button onclick="logData('log-data')">Log Prize Pool & Hashrate</button>
    <button onclick="logData('log-payments')">Log Payment Data</button>
    <button onclick="logData('log-auction-data')">Log Auction Data</button>
    <button onclick="logData('log-ah-history')">Log AH History</button>
  </div>

  <div class="section">
    <h2>View Data</h2>
    <button onclick="viewData('get-channel-data')">View Channel Data</button>
    <button onclick="viewData('get-payment-data')">View Payment Data</button>
    <button onclick="viewData('get-auction-data')">View Auction Data</button>
    <button onclick="viewData('get-ah-history')">View AH History</button>
    <button onclick="viewData('get-current-metrics')">View Current Metrics</button>
  </div>

  <div class="section">
    <h2>Download Data</h2>
    <button onclick="downloadData('download-channel-data')">Download Channel Data</button>
    <button onclick="downloadData('download-payment-data')">Download Payment Data</button>
    <button onclick="downloadData('download-auction-data')">Download Auction Data</button>
    <button onclick="downloadData('download-ah-history')">Download AH History</button>
  </div>

  <div id="status" class="status"></div>

  <script>
    const BASE_URL = window.location.origin;

    function showStatus(message, type) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.className = \`status \${type}\`;
      status.style.display = 'block';

      setTimeout(() => {
        status.style.display = 'none';
      }, 5000);
    }

    async function logData(endpoint) {
      try {
        const response = await fetch(\`\${BASE_URL}/\${endpoint}\`);
        const html = await response.text();

        if (response.ok) {
          showStatus('Operation completed successfully!', 'success');
        } else {
          showStatus(\`Error: \${response.status}\`, 'error');
        }
      } catch (error) {
        showStatus(\`Error: \${error.message}\`, 'error');
      }
    }

    async function viewData(endpoint) {
      try {
        const response = await fetch(\`\${BASE_URL}/\${endpoint}\`);
        const data = await response.json();

        if (response.ok) {
          showStatus(\`Data loaded: \${data.length} records\`, 'success');

          // Open data in new tab
          const newTab = window.open(\`\${BASE_URL}/\${endpoint}\`, '_blank');
          if (!newTab) {
            showStatus('Please allow popups to view data in new tab', 'error');
          }
        } else {
          showStatus(\`Error loading data: \${response.status}\`, 'error');
        }
      } catch (error) {
        showStatus(\`Error: \${error.message}\`, 'error');
      }
    }

    async function downloadData(endpoint) {
      try {
        const response = await fetch(\`\${BASE_URL}/\${endpoint}\`);

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = \`\${endpoint.replace('download-', '')}_\${new Date().toISOString().split('T')[0]}.json\`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          showStatus('Download completed!', 'success');
        } else {
          showStatus(\`Download failed: \${response.status}\`, 'error');
        }
      } catch (error) {
        showStatus(\`Download error: \${error.message}\`, 'error');
      }
    }
  </script>
</body>
</html>`;

        response = new Response(htmlContent, {
          headers: { 'Content-Type': 'text/html', ...corsHeaders },
          status: 200
        });
      }

      return response;
    } catch (error) {
      const err = error as Error;
      console.error('Error in fetch:', err.message, err.stack);
      return new Response(`Error processing request: ${err.message}`, {
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        status: 500,
      });
    }
  },

};

async function getAndWritePrizePoolAndHashrate(env: Env): Promise<ChannelData> {
  const guildId = '693277482367058020';

  if (!env.USER_TOKEN) {
    console.error('Error: User token not set');
    return { prizePool: 'Error', hashrate: 'Error', timestamp: 'Error' };
  }

  const url = `https://discord.com/api/v10/guilds/${guildId}/channels`;

  const options: RequestInit = {
    method: 'GET',
    headers: {
      Authorization: env.USER_TOKEN,
      'Content-Type': 'application/json',
    },
  };

  try {
    const response = await fetch(url, options);
    const responseText = await response.text();

    if (!response.ok) {
      console.error('API request failed:', responseText);
      throw new Error(`API request failed with status: ${response.status}`);
    }

    const channels = JSON.parse(responseText);

    const prizePoolChannel =
      channels
        .filter(
          (channel: any) =>
            (channel.type === 0 || channel.type === 2) &&
            channel.name.toLowerCase().startsWith('prize pool:')
        )
        .map((channel: any) => channel.name.replace(/^prize pool:\s*/i, '').trim())[0] || 'N/A';

    const hashrateChannel =
      channels
        .filter(
          (channel: any) =>
            (channel.type === 0 || channel.type === 2) &&
            channel.name.toLowerCase().startsWith('hashrate:')
        )
        .map((channel: any) => channel.name.replace(/^hashrate:\s*/i, '').trim())[0] || 'N/A';

    if (!prizePoolChannel && !hashrateChannel) {
      return { prizePool: 'N/A', hashrate: 'N/A', timestamp: 'N/A' };
    }

    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ${CHANNEL_DATA_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prize_pool TEXT,
        hashrate TEXT,
        timestamp TEXT UNIQUE
      )
    `).run();

    const writeResult = await env.DB.prepare(`
      INSERT OR REPLACE INTO ${CHANNEL_DATA_TABLE} (prize_pool, hashrate, timestamp)
      VALUES (?, ?, ?)
    `).bind(prizePoolChannel, hashrateChannel, timestamp).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ${CURRENT_METRICS_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prize_pool TEXT,
        hashrate TEXT,
        last_updated TEXT UNIQUE
      )
    `).run();

    await env.DB.prepare(`DELETE FROM ${CURRENT_METRICS_TABLE}`).run();
    await env.DB.prepare(`
      INSERT INTO ${CURRENT_METRICS_TABLE} (prize_pool, hashrate, last_updated)
      VALUES (?, ?, ?)
    `).bind(prizePoolChannel, hashrateChannel, timestamp).run();

    return { prizePool: prizePoolChannel, hashrate: hashrateChannel, timestamp };
  } catch (error) {
    const err = error as Error;
    console.error('Error in getAndWritePrizePoolAndHashrate:', err.message, err.stack);
    return { prizePool: 'Error', hashrate: 'Error', timestamp: 'Error' };
  }
}

async function processPrizePoolRewardsLastHour(env: Env): Promise<PaymentData> {
  const ROWS_TO_CHECK = 50;
  const HOURS_WINDOW = 4;

  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ${PAYMENT_DATA_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT UNIQUE,
        sats_paid TEXT
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ${CHANNEL_DATA_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prize_pool TEXT,
        hashrate TEXT,
        timestamp TEXT
      )
    `).run();

    const now = new Date();
    const windowStart = new Date(now.getTime() - HOURS_WINDOW * 60 * 60 * 1000);

    const existing = await env.DB.prepare(`SELECT timestamp FROM ${PAYMENT_DATA_TABLE} ORDER BY timestamp DESC`).all();
    const existingTimestamps = existing.results.map((row: any) => row.timestamp);

    const channelDataResult = await env.DB.prepare(`
      SELECT prize_pool, hashrate, timestamp
      FROM ${CHANNEL_DATA_TABLE}
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(ROWS_TO_CHECK).all();

    const channelData = channelDataResult.results as { prize_pool: string; hashrate: string; timestamp: string }[];

    if (channelData.length < 2) {
      return { messagesFetched: channelData.length, newEntries: 0, error: 'Insufficient data in channel_data' };
    }

    const sortedChannelData = channelData.reverse();

    const validRows = sortedChannelData.filter(row => {
      const timestampDate = new Date(row.timestamp);
      return !isNaN(timestampDate.getTime()) && timestampDate >= windowStart && timestampDate <= now;
    });

    if (validRows.length < 2) {
      return { messagesFetched: channelData.length, newEntries: 0, error: `Only ${validRows.length} row(s) within time window` };
    }

    let newEntries = 0;

    for (let i = 0; i < sortedChannelData.length - 1; i++) {
      const currentPrize = parseFloat(sortedChannelData[i].prize_pool.replace(/,/g, ''));
      const nextPrize = parseFloat(sortedChannelData[i + 1].prize_pool.replace(/,/g, ''));
      let timestamp = sortedChannelData[i].timestamp;

      if (!timestamp || isNaN(currentPrize) || isNaN(nextPrize)) {
        continue;
      }

      const timestampDate = new Date(timestamp);
      if (isNaN(timestampDate.getTime()) || timestampDate < windowStart || timestampDate > now) {
        continue;
      }

      timestampDate.setUTCMinutes(8);
      timestampDate.setUTCSeconds(0);
      const formattedTimestamp = timestampDate.toISOString().replace('T', ' ').split('.')[0] + ' UTC';

      if (!existingTimestamps.includes(formattedTimestamp)) {
        if (currentPrize > nextPrize) {
          const reward = currentPrize - nextPrize;

          await env.DB.prepare(`
            INSERT INTO ${PAYMENT_DATA_TABLE} (timestamp, sats_paid)
            VALUES (?, ?)
          `).bind(formattedTimestamp, reward.toString()).run();
          newEntries++;
        } else {
        }
      } else {
      }
    }

    return { messagesFetched: sortedChannelData.length, newEntries };
  } catch (error) {
    const err = error as Error;
    console.error('Error processing prizepool data:', err.message, err.stack);
    return { messagesFetched: 0, newEntries: 0, error: err.message };
  }
}

async function fetchAndWriteAuctionData(env: Env): Promise<AuctionData[]> {
  const channelIds = ['1338601164278861865', '1338601356373655664']; // asics and joules channels

  if (!env.USER_TOKEN) {
    console.error('Error: User token not set');
    return [];
  }

  const auctionData: AuctionData[] = [];
  const fetchedItemIds: string[] = [];

  try {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${AUCTION_HOUSE_TABLE}`).run();
    const createTableResult = await env.DB.prepare(`
      CREATE TABLE ${AUCTION_HOUSE_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        item TEXT,
        quantity INTEGER,
        price TEXT,
        timestamp TEXT UNIQUE,
        item_id TEXT
      )
    `).run();

    for (const channelId of channelIds) {
      const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`;

      const options: RequestInit = {
        method: 'GET',
        headers: {
          Authorization: env.USER_TOKEN,
          'Content-Type': 'application/json',
        },
      };

      const response = await fetch(url, options);
      const responseText = await response.text();

      if (!response.ok) {
        console.error('API request failed:', responseText);
        throw new Error(`API request failed with status: ${response.status} for channel ${channelId}`);
      }

      const messages = JSON.parse(responseText);

      for (const message of messages) {
        if (message.embeds && message.embeds.length > 0) {
          const embed = message.embeds[0];
          const embedTitle = embed.title ? embed.title.replace(/\*\*/g, '') : '';

          if (embedTitle === 'Item Sale' && embed.fields && embed.fields.length >= 3) {
            const username = embed.author?.name || 'Unknown';
            const itemField = embed.fields.find((field: any) => field.name === 'Item');
            const quantityField = embed.fields.find((field: any) => field.name === 'Quantity');
            const priceField = embed.fields.find((field: any) => field.name === 'Price');
            const itemIdField = embed.fields.find((field: any) => field.name === 'Item ID');

            if (!itemField || !quantityField || !priceField || !itemIdField) {
              continue;
            }

            const item = itemField.value || 'N/A';
            const quantity = parseInt(quantityField.value.replace(/,/g, '')) || 0;
            const price = priceField.value.replace(/,/g, '') || 'N/A';
            const item_id = itemIdField.value || 'N/A';
            const timestamp = new Date(message.timestamp).toISOString().replace('T', ' ').split('.')[0] + ' UTC';

            fetchedItemIds.push(item_id);

            const existing = await env.DB.prepare(`
              SELECT timestamp FROM ${AUCTION_HOUSE_TABLE} WHERE timestamp = ?
            `).bind(timestamp).first();

            if (!existing) {
              try {
                const writeResult = await env.DB.prepare(`
                  INSERT OR REPLACE INTO ${AUCTION_HOUSE_TABLE} (username, item, quantity, price, timestamp, item_id)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).bind(username, item, quantity, price, timestamp, item_id).run();

                auctionData.push({ username, item, quantity, price, timestamp, item_id });
              } catch (dbError) {
                const err = dbError as Error;
                console.error(`Database write error for timestamp ${timestamp}:`, err.message, err.stack);
              }
            } else {
            }
          } else {
          }
        } else {
        }
      }
    }

    // Delete rows from auction_house where item_id is not in fetchedItemIds
    if (fetchedItemIds.length > 0) {
      try {
        const placeholders = fetchedItemIds.map(() => '?').join(',');
        const deleteResult = await env.DB.prepare(`
          DELETE FROM ${AUCTION_HOUSE_TABLE}
          WHERE item_id NOT IN (${placeholders})
        `).bind(...fetchedItemIds).run();
      } catch (dbError) {
        const err = dbError as Error;
        console.error('Database delete error:', err.message, err.stack);
      }
    } else {
    }

    return auctionData;
  } catch (error) {
    const err = error as Error;
    console.error('Error in fetchAndWriteAuctionData:', err.message, err.stack);
    return [];
  }
}

async function fetchAndWriteAhHistory(env: Env): Promise<AhHistoryData[]> {
  const channelId = '1338601436367290451'; // ah-history channel ID
  const MESSAGES_LIMIT = 30;

  if (!env.USER_TOKEN) {
    console.error('Error: User token not set');
    return [];
  }

  const ahHistoryData: AhHistoryData[] = [];

  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ${AH_HISTORY_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller TEXT,
        buyer TEXT,
        item TEXT,
        quantity INTEGER,
        price TEXT,
        timestamp TEXT UNIQUE
      )
    `).run();

    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${MESSAGES_LIMIT}`;

    const options: RequestInit = {
      method: 'GET',
      headers: {
        Authorization: env.USER_TOKEN,
        'Content-Type': 'application/json',
      },
    };

    const response = await fetch(url, options);
    const responseText = await response.text();

    if (!response.ok) {
      console.error('API request failed:', responseText);
      throw new Error(`API request failed with status: ${response.status} for channel ${channelId}`);
    }

    const messages = JSON.parse(responseText);

    for (const message of messages) {
      if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const embedTitle = embed.title ? embed.title.replace(/\*\*/g, '') : '';

        if (embedTitle === 'Item Sale' && embed.description) {
          const description = embed.description;
          const timestamp = new Date(message.timestamp).toISOString().replace('T', ' ').split('.')[0] + ' UTC';

          // Regex to extract seller, buyer, item, quantity, and price from the description
          // It looks for: **BUYER** bought **QUANTITYx ITEM** from **SELLER** for **PRICE**.
          const match = description.match(/\*\*(.*?)\*\* bought \*\*(.*?)(?:x)? (.*?)\*\* from \*\*(.*?)\*\* for \*\*(.*?)\*\./);

          if (match && match.length >= 6) {
            const buyer = match[1];
            const quantityRaw = match[2];
            const item = match[3];
            const seller = match[4];
            let price = match[5]; // Captured price value

            // Clean the price string: remove commas, then any trailing non-alphanumeric characters
            // This handles cases where the price might end with a stray asterisk due to formatting issues.
            price = price.replace(/,/g, ''); // Remove commas from the price (e.g., "27,000" -> "27000")
            price = price.replace(/[^a-zA-Z0-9\s]+$/, ''); // Remove any non-alphanumeric/non-space characters from the end

            const quantity = parseInt(quantityRaw.replace(/,/g, '')) || 0; // Parse quantity, remove commas

            // Check if a record with the same timestamp already exists to avoid duplicates
            const existing = await env.DB.prepare(`
              SELECT timestamp FROM ${AH_HISTORY_TABLE} WHERE timestamp = ?
            `).bind(timestamp).first();

            if (!existing) {
              try {
                // Insert the new auction history entry into the database
                const writeResult = await env.DB.prepare(`
                  INSERT INTO ${AH_HISTORY_TABLE} (seller, buyer, item, quantity, price, timestamp)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).bind(seller, buyer, item, quantity, price, timestamp).run();

                ahHistoryData.push({ seller, buyer, item, quantity, price, timestamp });
              } catch (dbError) {
                const err = dbError as Error;
                console.error(`Database write error for timestamp ${timestamp}:`, err.message, err.stack);
              }
            } else {
            }
          } else {
          }
        } else {
        }
      } else {
      }
    }

    return ahHistoryData;
  } catch (error) {
    const err = error as Error;
    console.error('Error in fetchAndWriteAhHistory:', err.message, err.stack);
    return [];
  }
}
