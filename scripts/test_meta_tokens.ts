import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testGraph() {
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN || pageToken;
  console.log('META_PAGE_ACCESS_TOKEN exists:', !!pageToken, 'length:', pageToken?.length);
  console.log('INSTAGRAM_ACCESS_TOKEN exists:', !!igToken, 'length:', igToken?.length);

  if (pageToken) {
    try {
      const res = await fetch('https://graph.facebook.com/v21.0/me?access_token=' + encodeURIComponent(pageToken));
      const data = await res.json();
      console.log('PAGE TOKEN /me result:', data);
    } catch (e) {
      console.error('Page token error:', e);
    }
  }

  process.exit(0);
}

testGraph().catch(console.error);
