import { parentPort, workerData } from 'worker_threads';

function normalizeText(input) {
  return input
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parsePdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // In Node, pdfjs uses its fake-worker path and first checks
  // `globalThis.pdfjsWorker.WorkerMessageHandler`. Preloading the worker module
  // avoids brittle runtime path resolution inside bundled server output.
  globalThis.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
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
      // Bail early only if we've seen nothing but empty pages so far.
      // Once any page has text, we must continue — later pages may have content.
      if (consecutiveEmpty >= 3 && totalChars === 0) break;
    } else {
      consecutiveEmpty = 0;
    }
  }
  const text = normalizeText(pages.join('\n'));
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

    // Cleaned count: strip whitespace and non-word noise
    // \p{L} matches any Unicode letter, \p{N} matches any Unicode number
    const cleaned = text
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = cleaned.length > 0 ? cleaned.split(/\s+/).length : 0;
    const charCount = cleaned.length;

    if (charCount < 20 || wordCount < 5) {
      throw new Error(workerData.type === 'pdf' ? 'pdf_no_text_layer' : 'no_extractable_text');
    }

    parentPort?.postMessage({ success: true, text });
  } catch (e) {
    parentPort?.postMessage({ success: false, error: e.message });
  }
}

run();
