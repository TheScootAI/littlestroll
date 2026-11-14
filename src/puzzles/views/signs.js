// The carved signs: eight bold white-on-clear symbols, distinct at distance. 0-5 are the
// Signal's (circle, triangle, square, cross, crescent, zigzag), 6 a five-point star, 7 a spiral.
import { CanvasTexture, SRGBColorSpace } from 'three';

export const SIGN_COUNT = 8;

export function signTexture(i) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.lineWidth = 34; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  switch (i) {
    case 0: g.arc(128, 128, 82, 0, Math.PI * 2); g.stroke(); break;                       // circle (ring)
    case 1: g.moveTo(128, 30); g.lineTo(226, 214); g.lineTo(30, 214); g.closePath(); g.fill(); break; // triangle
    case 2: g.rect(40, 40, 176, 176); g.fill(); break;                                    // square
    case 3: g.moveTo(40, 40); g.lineTo(216, 216); g.moveTo(216, 40); g.lineTo(40, 216); g.stroke(); break; // cross (X)
    case 4:                                                                               // crescent
      g.arc(128, 128, 96, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(164, 108, 84, 0, Math.PI * 2); g.fill();
      break;
    case 5:                                                                               // zigzag
      g.lineWidth = 30; g.moveTo(24, 190); g.lineTo(76, 66); g.lineTo(128, 190); g.lineTo(180, 66); g.lineTo(232, 190); g.stroke(); break;
    case 6:                                                                               // five-point star
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 50 : 112;
        g[k ? 'lineTo' : 'moveTo'](128 + rr * Math.cos(a), 134 + rr * Math.sin(a));
      }
      g.closePath(); g.fill(); break;
    default: {                                                                            // spiral
      g.lineWidth = 26;
      for (let k = 0; k <= 120; k++) {
        const a = k * 0.12, rr = 8 + k * 0.78;
        g[k ? 'lineTo' : 'moveTo'](128 + rr * Math.cos(a), 128 + rr * Math.sin(a));
      }
      g.stroke();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
