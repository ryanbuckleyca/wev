import { parentPort, workerData } from 'worker_threads';

function normalizeText(input) {
  return input.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

async function parsePdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  
  const pages = [];
  let totalChars = 0;
  let consecutiveEmpty = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str ?? '').join(' ');
    pages.push(pageText);
    const trimmedLen = pageText.trim().length;
    totalChars += trimmedLen;

    if (trimmedLen === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= 3 && totalChars === 0) break;
    } else {
      consecutiveEmpty = 0;
    }
  }
  const text = normalizeText(pages.join('\n'));
  if (text.length < 80) throw new Error('pdf_no_text_layer');
  return text;
}

async function parseDocx(buffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return normalizeText(result.value || '');
}

async function run() {
  try {
    let text;
    if (workerData.type === 'pdf') {
      text = await parsePdf(workerData.buffer);
    } else {
      text = await parseDocx(workerData.buffer);
    }
    parentPort?.postMessage({ success: true, text });
  } catch (e) {
    parentPort?.postMessage({ success: false, error: e.message });
  }
}

run();
