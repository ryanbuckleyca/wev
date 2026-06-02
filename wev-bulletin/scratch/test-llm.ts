// Mock server-only
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
  if (path === 'server-only') return {};
  return originalRequire.apply(this, arguments);
};

import { extractWithLlm } from '../lib/cv/llm';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const groqKey = process.env.GROQ_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';
  console.log('Keys present?', !!groqKey, !!geminiKey);
  
  try {
    const res = await extractWithLlm({
      cvText: 'I am a software engineer with 5 years of experience in React and Node.js. I value teamwork.',
      groqKey: 'invalid-key-to-force-fallback',
      userId: 'test-user',
      groqModel: 'llama-3.3-70b-versatile',
      locale: 'en',
      geminiKey,
    });
    console.log('Result:', res);
  } catch (err) {
    console.error('Error details:', err);
  }
}
main();
