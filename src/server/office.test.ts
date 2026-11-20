import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  applyTranslations,
  extractSegments,
  isOfficeFile,
  officeKind,
  translatedName,
} from "./office";

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const read = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]!);

describe("office files", () => {
  it("translates Word paragraphs in place, keeping the first run's formatting", () => {
    const doc = `<w:document><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Fish &amp; </w:t></w:r><w:r><w:t>chips</w:t></w:r></w:p><w:p><w:r><w:t>2024</w:t></w:r></w:p></w:body></w:document>`;
    const file = zip({ "word/document.xml": doc, "word/styles.xml": "<w:styles/>" });
    expect(isOfficeFile("docx", file)).toBe(true);
    expect(isOfficeFile("pptx", file)).toBe(false);
    expect(extractSegments("docx", file)).toEqual(["Fish & chips"]);
    const out = applyTranslations("docx", file, ["Poisson & frites"]);
    const xml = read(out, "word/document.xml");
    expect(xml).toContain(`<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Poisson &amp; frites</w:t>`);
    expect(xml).toContain(`<w:jc w:val="center"/>`);
    expect(xml).toContain(`<w:t>2024</w:t>`);
    expect(read(out, "word/styles.xml")).toBe("<w:styles/>");
  });

  it("translates slides and spreadsheet strings", () => {
    const pptx = zip({
      "ppt/presentation.xml": "<p:presentation/>",
      "ppt/slides/slide1.xml": `<p:sld><a:p><a:r><a:t>Welcome</a:t></a:r></a:p></p:sld>`,
    });
    expect(extractSegments("pptx", pptx)).toEqual(["Welcome"]);
    expect(read(applyTranslations("pptx", pptx, ["Bienvenue"]), "ppt/slides/slide1.xml"))
      .toContain(">Bienvenue</a:t>");

    const xlsx = zip({
      "xl/workbook.xml": "<workbook/>",
      "xl/sharedStrings.xml": `<sst><si><t>Total</t></si><si><r><t>Net </t></r><r><t>sales</t></r></si></sst>`,
    });
    expect(extractSegments("xlsx", xlsx)).toEqual(["Total", "Net sales"]);
    const strings = read(applyTranslations("xlsx", xlsx, ["Gesamt", "Nettoumsatz"]), "xl/sharedStrings.xml");
    expect(strings).toContain(">Gesamt</t>");
    expect(strings).toContain(">Nettoumsatz</t></r><r><t></t>");
  });

  it("names and recognizes files", () => {
    expect(officeKind("Plan.PPTX")).toBe("pptx");
    expect(officeKind("notes.pdf")).toBeNull();
    expect(translatedName("report.v2.docx", "fr")).toBe("report.v2.fr.docx");
    expect(isOfficeFile("docx", strToU8("not a zip"))).toBe(false);
  });
});
