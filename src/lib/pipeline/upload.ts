const CATBOX_URL = "https://catbox.moe/user/api.php";

export async function uploadToCatbox(buffer: Buffer, filename: string): Promise<string> {
  console.log(`[upload] ${filename} (${buffer.length} bytes)`);

  // Build multipart form manually (no extra deps)
  const boundary = `----formdata-${Date.now()}`;
  const parts: Buffer[] = [];

  // reqtype field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`
  ));

  // file field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  ));
  parts.push(buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const res = await fetch(CATBOX_URL, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });

  const text = (await res.text()).trim();
  if (!text.startsWith("http")) {
    throw new Error(`Catbox error: ${text.slice(0, 200)}`);
  }

  console.log(`[upload] → ${text}`);
  return text;
}
