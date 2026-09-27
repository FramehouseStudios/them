// MPEG audio frame-header lookup tables, moved verbatim from index.js.

function mp3BitrateKbpsForHeader(versionKey, layerNumber, bitrateIndex) {
  const key = `${versionKey}-L${layerNumber}`;
  const tables = {
    "1-L1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
    "1-L2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
    "1-L3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    "2-L1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    "2-L2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    "2-L3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    "2.5-L1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    "2.5-L2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    "2.5-L3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  };
  const table = tables[key];
  return table ? Number(table[bitrateIndex] || 0) : 0;
}

function mp3SampleRateForHeader(versionKey, sampleRateIndex) {
  const tables = {
    "1": [44100, 48000, 32000, 0],
    "2": [22050, 24000, 16000, 0],
    "2.5": [11025, 12000, 8000, 0],
  };
  const table = tables[versionKey];
  return table ? Number(table[sampleRateIndex] || 0) : 0;
}

export { mp3BitrateKbpsForHeader, mp3SampleRateForHeader };
