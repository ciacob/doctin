import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { parseClassHtml } from './parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [,, inputDir, outputDir] = process.argv;

if (!inputDir || !outputDir) {
  console.error("Usage: node index.js <asdoc-folder> <astjson-folder>");
  process.exit(1);
}

const allClassesPath = path.join(inputDir, 'all-classes.html');
if (!fs.existsSync(allClassesPath)) {
  console.error('Missing all-classes.html in input folder.');
  process.exit(1);
}

const cleanFlag = process.argv.includes('--clean');

const outputExists = await fs.pathExists(outputDir);
const outputIsEmpty = outputExists ? (await fs.readdir(outputDir)).length === 0 : true;

if (outputExists && !outputIsEmpty) {
  if (cleanFlag) {
    console.log(`🧹 Cleaning output folder: ${outputDir}`);
    await fs.emptyDir(outputDir);
  } else {
    console.error(`❌ Output folder "${outputDir}" is not empty. Use --clean to overwrite.`);
    process.exit(1);
  }
}

const contentTree = {};

const html = await fs.readFile(allClassesPath, 'utf-8');
const $ = cheerio.load(html);

// ⬇ Extract all class entries
const classLinks = $('td > a')
  .map((_, el) => {
    const relativeHref = $(el).attr('href'); // e.g., org/bytearray/display/ScaleBitmap.html
    const title = $(el).attr('title'); // e.g., org.bytearray.display.ScaleBitmap
    const className = title?.split('.').pop();
    const pkg = title?.split('.').slice(0, -1).join('.');
    return { relativeHref, className, pkg };
  })
  .get()
  .filter(({ relativeHref, className, pkg }) => relativeHref && className && pkg);

for (const { relativeHref, className, pkg } of classLinks) {
  const classHtmlPath = path.join(inputDir, relativeHref);
  if (!await fs.pathExists(classHtmlPath)) {
    console.warn(`⚠️ Skipping missing class file: ${relativeHref}`);
    continue;
  }

  const classData = await parseClassHtml(classHtmlPath);
  if (!classData) {
    console.warn(`⚠️ Failed to parse: ${relativeHref}`);
    continue;
  }

  const outputFile = path.join(outputDir, ...pkg.split('.'), `${className}.json`);
  const relativeOutput = path.relative(outputDir, outputFile).replace(/\\/g, '/');

  await fs.outputJson(outputFile, classData, { spaces: 2 });

  if (!contentTree[pkg]) contentTree[pkg] = {};
  contentTree[pkg][className] = relativeOutput;
}

await fs.outputJson(path.join(outputDir, 'contentTree.json'), contentTree, { spaces: 2 });
console.log('✅ AST JSON export complete.');
