// Editable source graphics: no screenshot or frame from the reference is used.
export const MESSAGE = [
  "【浙江大学】欢迎您在 2026年09月04",
  "~2026年09月04日访问紫金港校区。",
  "支付宝 “浙大通” 小程序通行码或本人",
  "身份证进入校园。",
];
export const FONT_TEXT = MESSAGE.join("") + "信息·短信前天 21:07";
const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
};
export const drawMessage = (
  canvas: HTMLCanvasElement,
  highlight: number,
  color: string,
  settle = 0,
) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const { width, height } = canvas;
  ctx.reset();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(400, 400);
  ctx.fillStyle = "#111113";
  ctx.fillRect(-400, -400, width, 600 + settle * 63);
  // Measured near/far-screen parallax accompanies the lens turn.
  ctx.save();
  ctx.translate(0, settle * 94);
  ctx.save();
  ctx.translate(0, -73);
  ctx.fillStyle = "#9196a2";
  ctx.beginPath();
  ctx.ellipse(590, 45, 105, 92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e5e6e6";
  ctx.beginPath();
  ctx.ellipse(590, 20, 35, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(520, 103);
  ctx.bezierCurveTo(534, 48, 647, 48, 660, 103);
  ctx.quadraticCurveTo(590, 145, 520, 103);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.font = "51px Arial, sans-serif";
  ctx.fillStyle = "#eeeef0";
  ctx.fillText("1068803970779", 590, 153);
  ctx.strokeStyle = "#58585b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(839, 132);
  ctx.lineTo(849, 144);
  ctx.lineTo(839, 156);
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillStyle = "#0488d7";
  roundRect(ctx, -208, -14, 96, 53, 27);
  ctx.font = "36px Arial, sans-serif";
  ctx.fillStyle = "#b9e9ff";
  ctx.fillText("52", -154, 25);
  ctx.fillStyle = "#c8c9c9";
  ctx.save();
  ctx.translate(144, -194 + settle * 84);
  for (let i = 0; i < 4; i++)
    roundRect(ctx, 893 + i * 13, -14 + (3 - i) * 8, 9, 15 + i * 8, 2);
  ctx.strokeStyle = "#c8c9c9";
  ctx.lineWidth = 6;
  for (const radius of [27, 16]) {
    ctx.beginPath();
    ctx.arc(969, 27, radius, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(969, 24, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b6b7b9";
  roundRect(ctx, 1015, -4, 64, 37, 10);
  ctx.fillStyle = "#1a1a1c";
  ctx.font = "bold 29px Arial, sans-serif";
  ctx.fillText("34", 1047, 24);
  ctx.restore();
  ctx.font = '45px "Noto Sans SC"';
  ctx.fillStyle = "#89888d";
  ctx.fillText("信息 · 短信", 590, 320 + settle * 43);
  ctx.font = '47px "Noto Sans SC"';
  ctx.fillText("前天 21:07", 590, 379 + settle * 43);
  ctx.fillStyle = "#272729";
  roundRect(ctx, -420, 450, 1640, 485, 86);
  ctx.textAlign = "left";
  ctx.font = '72px "Noto Sans SC"';
  const positions = [-235, -98, -98, -175],
    baselines = [552, 658, 764, 870],
    lineWidths = [1325, 1340, 1280, 610];
  MESSAGE.forEach((line, i) => {
    const scale = lineWidths[i] / ctx.measureText(line).width;
    ctx.save();
    ctx.translate(positions[i], baselines[i]);
    ctx.scale(scale, 1);
    if (i === 2 && highlight > 0) {
      const before = ctx.measureText("支付宝 “").width,
        selected = ctx.measureText("浙大").width;
      ctx.fillStyle = color;
      ctx.fillRect(before - 3, -76, (selected + 5) * highlight, 101);
    }
    ctx.fillStyle = "#eeeeef";
    ctx.fillText(line, 0, 0);
    if (i < 2) {
      const prefix = i === 0 ? "【浙江大学】欢迎您在 " : "~";
      const date = i === 0 ? "2026年09月04" : "2026年09月04日";
      const begin = ctx.measureText(prefix).width;
      ctx.fillStyle = "#99999b";
      ctx.fillRect(begin, 9, ctx.measureText(date).width, 3);
    }
    ctx.restore();
  });
};
