// Client-side Code 128 (Subset B) SVG generator
const PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const START_B = 104;
const STOP = 106;

export function generateCode128Svg(text: string, height: number = 38, moduleWidth: number = 1.15): string {
  const values = [START_B];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    values.push(code >= 32 && code <= 126 ? code - 32 : 0);
  }

  let checksum = values[0];
  for (let i = 1; i < values.length; i++) {
    checksum += i * values[i];
  }
  values.push(checksum % 103);
  values.push(STOP);

  const modules: number[] = [];
  for (const val of values) {
    const pattern = PATTERNS[val];
    let isBar = true;
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      for (let k = 0; k < width; k++) {
        modules.push(isBar ? 1 : 0);
      }
      isBar = !isBar;
    }
  }

  const quietZone = 8;
  const totalModules = modules.length + quietZone * 2;
  const svgWidth = totalModules * moduleWidth;
  const svgHeight = height + 14;

  let rects = '';
  let currX = quietZone * moduleWidth;
  const barHeight = height - 12;

  for (const m of modules) {
    if (m === 1) {
      rects += `<rect x="${currX.toFixed(2)}" y="2" width="${moduleWidth.toFixed(2)}" height="${barHeight}" fill="#000000" />`;
    }
    currX += moduleWidth;
  }

  const textY = height + 8;
  const centerX = svgWidth / 2;
  const textElem = `<text x="${centerX.toFixed(2)}" y="${textY}" font-family="monospace, Courier" font-size="9" font-weight="700" letter-spacing="1.2" text-anchor="middle" fill="#000000">${text}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth.toFixed(2)} ${svgHeight}" width="${svgWidth.toFixed(2)}" height="${svgHeight}">
    <rect width="100%" height="100%" fill="#ffffff" />
    ${rects}
    ${textElem}
  </svg>`;
}
