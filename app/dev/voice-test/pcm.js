// Preserve a partial int16 sample across arbitrary network chunk boundaries.
export function decodePcm(bytes, previous) {
  const data = previous === null ? bytes : new Uint8Array([previous, ...bytes]);
  const count = Math.floor(data.length / 2), samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let value = data[i * 2] | (data[i * 2 + 1] << 8);
    if (value >= 32768) value -= 65536;
    samples[i] = value / 32768;
  }
  return { samples, remainder: data.length % 2 ? data[data.length - 1] : null };
}
