import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
const pageId = process.env.META_TEST_PAGE_ID || '1272873235901923';
const apiVersion = process.env.META_API_VERSION || 'v21.0';

async function main() {
  if (!pageToken) {
    console.error('Missing META_PAGE_ACCESS_TOKEN');
    return;
  }

  // 1. Debug Token Permissions
  console.log('\n--- 1. Debug Token Permissions ---');
  const debugUrl = `https://graph.facebook.com/${apiVersion}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(pageToken)}`;
  const debugRes = await fetch(debugUrl);
  const debugData = await debugRes.json();
  console.log('Debug Token Data:', JSON.stringify(debugData, null, 2));

  // 2. Try POST /subscribed_apps with subscribed_fields
  console.log('\n--- 2. Try POST /{page-id}/subscribed_apps ---');
  const subUrl = `https://graph.facebook.com/${apiVersion}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(pageToken)}`;
  const subRes = await fetch(subUrl, { method: 'POST' });
  const subData = await subRes.json();
  console.log('Subscribed Apps POST Status:', subRes.status);
  console.log('Subscribed Apps POST Response:', JSON.stringify(subData, null, 2));

  // 3. Try GET /subscribed_apps again if POST succeeds
  if (subRes.status === 200) {
    console.log('\n--- 3. GET /{page-id}/subscribed_apps after POST ---');
    const getUrl = `https://graph.facebook.com/${apiVersion}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`;
    const getRes = await fetch(getUrl);
    const getData = await getRes.json();
    console.log('Subscribed Apps GET Response:', JSON.stringify(getData, null, 2));
  }
}

main();
