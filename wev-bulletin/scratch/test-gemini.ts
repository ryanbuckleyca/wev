import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const geminiKey = '***REMOVED_GOOGLE_API_KEY***'; // wevchange@gmail.com
  // dotenv might leave the comment if not quoted sometimes? Let's check:
  console.log('Raw key from env:', geminiKey);
  const cleanKey = geminiKey.split(' ')[0].trim();
  console.log('Clean key:', cleanKey);
  
  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: 'You output only valid JSON. Reply {"test": true}' }] }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });
    
    if (!res.ok) {
      console.log('HTTP Error:', res.status, await res.text());
    } else {
      const data = await res.json();
      console.log('Success:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
main();
