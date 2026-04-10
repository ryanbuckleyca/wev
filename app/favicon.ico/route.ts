const ICON_SIZE = 32;

type RgbaColor = readonly [number, number, number, number];

const COLORS = {
  background: [12, 104, 85, 255] as const,
  accent: [35, 160, 134, 255] as const,
  foreground: [255, 255, 255, 255] as const,
} satisfies Record<string, RgbaColor>;

function setPixel(buffer: Uint8Array, x: number, y: number, color: RgbaColor) {
  if (x < 0 || x >= ICON_SIZE || y < 0 || y >= ICON_SIZE) return;

  const flippedY = ICON_SIZE - 1 - y;
  const index = (flippedY * ICON_SIZE + x) * 4;
  buffer[index] = color[2];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[0];
  buffer[index + 3] = color[3];
}

function fillCircle(
  buffer: Uint8Array,
  centerX: number,
  centerY: number,
  radius: number,
  color: RgbaColor,
) {
  const radiusSquared = radius * radius;
  const minX = Math.floor(centerX - radius);
  const maxX = Math.ceil(centerX + radius);
  const minY = Math.floor(centerY - radius);
  const maxY = Math.ceil(centerY + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radiusSquared) {
        setPixel(buffer, x, y, color);
      }
    }
  }
}

function fillRoundedRect(
  buffer: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: RgbaColor,
) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      const inCore =
        (col >= x + radius && col < x + width - radius) ||
        (row >= y + radius && row < y + height - radius);

      if (inCore) {
        setPixel(buffer, col, row, color);
        continue;
      }

      const cornerX = col < x + radius ? x + radius : x + width - radius - 1;
      const cornerY = row < y + radius ? y + radius : y + height - radius - 1;
      const dx = col - cornerX;
      const dy = row - cornerY;

      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(buffer, col, row, color);
      }
    }
  }
}

function drawLine(
  buffer: Uint8Array,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  thickness: number,
  color: RgbaColor,
) {
  const distance = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));

  for (let step = 0; step <= distance; step += 1) {
    const progress = distance === 0 ? 0 : step / distance;
    const x = Math.round(startX + (endX - startX) * progress);
    const y = Math.round(startY + (endY - startY) * progress);
    fillCircle(buffer, x, y, thickness / 2, color);
  }
}

function createFavicon() {
  const pixels = new Uint8Array(ICON_SIZE * ICON_SIZE * 4);

  fillRoundedRect(pixels, 2, 2, 28, 28, 8, COLORS.background);
  fillCircle(pixels, 25, 8, 6, COLORS.accent);

  drawLine(pixels, 7, 9, 12, 23, 3.5, COLORS.foreground);
  drawLine(pixels, 12, 23, 16, 15, 3.5, COLORS.foreground);
  drawLine(pixels, 16, 15, 20, 23, 3.5, COLORS.foreground);
  drawLine(pixels, 20, 23, 25, 9, 3.5, COLORS.foreground);

  const maskRowSize = Math.ceil(ICON_SIZE / 32) * 4;
  const mask = new Uint8Array(maskRowSize * ICON_SIZE);
  const imageDataSize = 40 + pixels.length + mask.length;
  const output = new Uint8Array(6 + 16 + imageDataSize);
  const view = new DataView(output.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);

  output[6] = ICON_SIZE;
  output[7] = ICON_SIZE;
  output[8] = 0;
  output[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, imageDataSize, true);
  view.setUint32(18, 22, true);

  view.setUint32(22, 40, true);
  view.setInt32(26, ICON_SIZE, true);
  view.setInt32(30, ICON_SIZE * 2, true);
  view.setUint16(34, 1, true);
  view.setUint16(36, 32, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, pixels.length + mask.length, true);
  view.setInt32(46, 0, true);
  view.setInt32(50, 0, true);
  view.setUint32(54, 0, true);
  view.setUint32(58, 0, true);

  output.set(pixels, 62);
  output.set(mask, 62 + pixels.length);

  return output;
}

export function GET() {
  return new Response(createFavicon(), {
    headers: {
      'Content-Type': 'image/x-icon',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
