const { Jimp } = require('jimp');
const path = require('path');

async function fixAdaptiveIcon() {
  const inputPath = path.join(__dirname, '../assets/logo.png');
  const outputPath = path.join(__dirname, '../assets/adaptive-icon.png');

  const bg = new Jimp({ width: 1024, height: 1024, color: 0x0D1117FF });

  const logo = await Jimp.read(inputPath);
  logo.resize({ w: 614, h: 614 });

  const x = (1024 - 614) / 2;
  const y = (1024 - 614) / 2;
  bg.composite(logo, x, y);

  await bg.write(outputPath);
  console.log('adaptive-icon.png created successfully');
}

fixAdaptiveIcon().catch(console.error);
