import * as cheerio from 'cheerio';
import fs from 'fs';

export async function parseClassHtml(filePath) {
  const html = await fs.promises.readFile(filePath, 'utf-8');
  const $ = cheerio.load(html);

  const header = $('.classHeaderTable');
  const classSignature = header.find('td:contains("Class")').next().text().trim();
  const classMatch = classSignature.match(/class\s+(\w+)/);
  const className = classMatch?.[1];
  if (!className) return null;

  const packageName = $('.classHeaderTableLabel:contains("Package")')
    .next()
    .text()
    .trim()
    .replace(/\s/g, '');

  const inheritance = [];
  $('td.inheritanceList').each((_, el) => {
    const chain = $(el).text().split('>').map(s => s.trim());
    if (chain.length > 1) inheritance.push(...chain.slice(1));
  });

  const extractSummary = (tableId, visibility) => {
    const rows = $(`#${tableId} tr`).slice(1); // skip header
    return rows.map((_, tr) => {
      const td = $(tr).find('.summaryTableSignatureCol');
      if (!td.length) return null;

      const raw = td.text().trim().replace(/\s+/g, ' ');
      const nameMatch = raw.match(/(\w+)\s*:\s*([\w.<>\[\]]+)/);
      const type = nameMatch?.[2]?.replace(/\[.*?\]/g, '').trim() || null;
      const name = nameMatch?.[1] || null;
      const asdoc = td.find('.summaryTableDescription').text().trim();
      const flags = [];
      if (raw.includes('[override]')) flags.push('override');
      if (raw.includes('[write-only]')) flags.push('write-only');
      if (raw.includes('[read-only]')) flags.push('read-only');

      return {
        name,
        type,
        visibility,
        modifiers: flags,
        hasAsdoc: !!asdoc,
        asdoc: asdoc || null
      };
    }).get().filter(Boolean);
  };

  const extractMethods = (tableId, visibility) => {
    const rows = $(`#${tableId} tr`).slice(1); // skip header
    return rows.map((_, tr) => {
      const sig = $(tr).find('.summarySignature');
      const raw = sig.text().trim();
      const nameMatch = raw.match(/(\w+)\((.*?)\)\s*:\s*(\w+)/);
      const name = nameMatch?.[1];
      const paramStr = nameMatch?.[2];
      const returnType = nameMatch?.[3];
      const params = paramStr
        ? paramStr.split(',').map(p => {
            const [name, type] = p.split(':').map(s => s.trim());
            return { name, type };
          })
        : [];

      const asdoc = sig.next('.summaryTableDescription').text().trim();

      return {
        name,
        returnType,
        params,
        visibility,
        hasAsdoc: !!asdoc,
        asdoc: asdoc || null
      };
    }).get().filter(Boolean);
  };

  return {
    name: className,
    package: packageName,
    inheritance,
    properties: [
      ...extractSummary('summaryTableProperty', 'public'),
      ...extractSummary('summaryTableProtectedProperty', 'protected')
    ],
    methods: [
      ...extractMethods('summaryTableMethod', 'public'),
      ...extractMethods('summaryTableProtectedMethod', 'protected')
    ]
  };
}
