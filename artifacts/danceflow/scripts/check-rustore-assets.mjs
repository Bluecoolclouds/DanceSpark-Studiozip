import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Read dimensions from PNG/JPEG headers; no image processing dependencies.
export function imageDimensions(buffer) {
  if (buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG без IHDR.');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png',
      opaque: [0, 2].includes(buffer[25]) && !buffer.includes(Buffer.from('tRNS')) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset++] !== 0xff) throw new Error('Повреждённый JPEG.');
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), format: 'jpg', opaque: true };
      }
      offset += length;
    }
  }
  throw new Error('Не удалось прочитать размеры PNG/JPEG.');
}

export function assetProblems(image, bytes, icon = false) {
  const problems = [];
  if (bytes > 3 * 1024 * 1024) problems.push('больше 3 МБ');
  if (image.width <= 0 || image.height <= 0) problems.push('нулевой размер');
  if (icon) {
    if (image.width !== 512 || image.height !== 512) problems.push('иконка должна быть 512×512');
    if (!image.opaque) problems.push('иконка должна иметь непрозрачный фон');
  } else if (image.width > 2160 || image.height > 3840) {
    problems.push('снимок превышает 2160×3840');
  }
  return problems;
}

async function main() {
  let failed = false;
  const directory = new URL('../rustore/screenshots/', import.meta.url);
  const screenshots = (await readdir(directory)).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort();
  if (screenshots.length < 3 || screenshots.length > 10) {
    console.error('Нужно от 3 до 10 снимков телефона.');
    failed = true;
  }
  const files = screenshots.map((name) => ({ name, url: new URL(name, directory), icon: false }));
  files.push({ name: 'danceflow-store-icon-512.png',
    url: new URL('../../../generated-artifacts/rustore/danceflow-store-icon-512.png', import.meta.url), icon: true });
  for (const file of files) {
    try {
      const bytes = (await stat(file.url)).size;
      if (bytes > 3 * 1024 * 1024) throw new Error('больше 3 МБ');
      const image = imageDimensions(await readFile(file.url));
      const problems = assetProblems(image, bytes, file.icon);
      console.log(`${file.name}: ${image.width}×${image.height}, ${bytes} B — ${problems.length ? problems.join('; ') : 'OK'}`);
      if (problems.length) failed = true;
    } catch (error) {
      console.error(`${file.name}: ${error.code === 'ENOENT' ? 'файл отсутствует' : error.message}`);
      failed = true;
    }
  }
  console.log('Проверены только формат, размеры и объём. Снимки остаются черновыми: не проверены актуальность, содержимое и работа Android-релиза.');
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
