/**
 * BreathEasy — Challenge 06 Submission Guide: document assembly.
 * Run: bun run generate.js
 */
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, SectionType, TableOfContents, PageBreak,
  PAL, EN, buildCoverR1,
} = require("./lib.js");
const body = require("./content.js");
const fs = require("fs");

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888", font: { ascii: EN } })],
    })],
  });
}
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: "single", size: 2, color: PAL.table.innerLine } },
      children: [new TextRun({ text: "BreathEasy — Challenge 06 Submission Guide", size: 16, color: "999999", font: { ascii: EN } })],
    })],
  });
}

const coverConfig = {
  title: "Challenge 06 Submission Guide",
  subtitle: "BreathEasy — Urban Air Quality Assistant · GenAI hackathon build",
  englishLabel: "SUBMISSION PLAYBOOK",
  metaLines: [
    "Deadline: 29 November 2026, 11:59 PM IST",
    "Attempts remaining: 3 of 3",
    "Current rank: #250 of 54,294 participants",
    "Evaluation: AI-reviewed on six criteria",
  ],
  footerLeft: "BreathEasy",
  footerRight: "November 2026",
  palette: { bg: PAL.bg, accent: PAL.accent, ...PAL.cover },
};

const doc = new Document({
  creator: "BreathEasy",
  title: "BreathEasy — Challenge 06 Submission Guide",
  description: "Detailed submission playbook for the GenAI hackathon Challenge 06 build",
  styles: {
    default: {
      document: {
        run: { font: { ascii: EN, eastAsia: "SimSun" }, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: EN, eastAsia: "SimHei" }, size: 32, bold: true, color: PAL.h1 },
        paragraph: { spacing: { before: 400, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: EN, eastAsia: "SimHei" }, size: 28, bold: true, color: PAL.h2 },
        paragraph: { spacing: { before: 280, after: 120, line: 312 }, outlineLevel: 1 },
      },
    },
  },
  sections: [
    // ---- Section 1: Cover (margin 0, no page numbers, no footer) ----
    {
      properties: {
        page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: buildCoverR1(coverConfig),
    },
    // ---- Section 2: TOC (Roman numerals) ----
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: { ascii: EN, eastAsia: "SimHei" }, color: PAL.h1 })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Note: This Table of Contents is generated via field codes. To refresh page numbers after editing, right-click the TOC and select \"Update Field\".",
            italics: true, size: 18, color: "888888", font: { ascii: EN },
          })],
        }),
        // No trailing PageBreak: the body starts in its own NEXT_PAGE section,
        // and a PageBreak here would create a blank page (skill rule ①).
      ],
    },
    // ---- Section 3: Body (Arabic numerals from 1) ----
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: body,
    },
  ],
});

const OUT = "/home/z/my-project/download/BreathEasy_Submission_Guide.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync("/home/z/my-project/download", { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log("Wrote", OUT, buf.length, "bytes");
});
