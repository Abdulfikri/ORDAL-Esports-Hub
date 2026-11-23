export async function compressImageDataUrl(
  file: File,
  maxDimension = 256,
  maxChars = 450000
): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Gagal membaca file gambar.'));
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });

  if (rawDataUrl.length <= 120000 || file.type === 'image/svg+xml') {
    return rawDataUrl.slice(0, maxChars);
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
      const width = Math.max(1, Math.round((img.width || maxDimension) * scale));
      const height = Math.max(1, Math.round((img.height || maxDimension) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl.slice(0, maxChars));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const webp = canvas.toDataURL('image/webp', 0.84);
      if (webp.length <= maxChars) {
        resolve(webp);
        return;
      }
      const jpeg = canvas.toDataURL('image/jpeg', 0.78);
      resolve(jpeg.length <= maxChars ? jpeg : rawDataUrl.slice(0, maxChars));
    };
    img.onerror = () => resolve(rawDataUrl.slice(0, maxChars));
    img.src = rawDataUrl;
  });
}
