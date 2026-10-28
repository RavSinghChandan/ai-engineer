// A valid one-page PDF (with a cross-reference table) holding a line of CV text.
export function makePdf(lines: string[]): Buffer {
  const stream = 'BT /F1 11 Tf 72 740 Td 14 TL ' + lines.map(l => `(${l}) '`).join(' ') + ' ET';
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
export const CV_PDF = makePdf([
  'Jane Doe - Software Engineer - jane.doe@example.com',
  'Summary: 3 years building backend services in Python and FastAPI.',
  'Skills: Python, FastAPI, SQL, PostgreSQL, Docker, REST APIs, Git, pytest.',
  'Experience: Backend Engineer, Example Corp (2023 - 2026).',
  'Built REST APIs serving 2 million requests a day; added caching and tests.',
  'Education: B.Tech in Computer Science, 2022.',
]);
