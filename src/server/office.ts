import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

// Translating an Office file in place: its text lives in XML parts of a zip.
// Each paragraph (a Word or PowerPoint paragraph, an Excel string) is one
// segment: its runs are joined, translated as one, and the translation goes
// into the paragraph's first run, so the paragraph keeps that run's
// formatting and every other part of the file is left as it was.

export type OfficeKind = "docx" | "pptx" | "xlsx";

export const OFFICE_TYPES: Record<OfficeKind, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

interface Grammar {
  /** Which parts hold text. */
  parts: RegExp;
  paragraph: RegExp;
  /** The element a run's text sits in. */
  tag: string;
  /** The part every file of this kind has. */
  main: string;
}

const GRAMMARS: Record<OfficeKind, Grammar> = {
  docx: {
    parts:
      /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/,
    paragraph: /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,
    tag: "w:t",
    main: "word/document.xml",
  },
  pptx: {
    parts: /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/,
    paragraph: /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g,
    tag: "a:t",
    main: "ppt/presentation.xml",
  },
  xlsx: {
    parts: /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/,
    paragraph: /<(si|is)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g,
    tag: "t",
    main: "xl/workbook.xml",
  },
};

function textPattern(tag: string): RegExp {
  return new RegExp(`<${tag}(\\s[^>]*)?>([^<]*)</${tag}>`, "g");
}

export function officeKind(filename: string): OfficeKind | null {
  const match = /\.(docx|pptx|xlsx)$/i.exec(filename);
  return match ? (match[1]!.toLowerCase() as OfficeKind) : null;
}

/** True when the bytes are a zip holding the main part of this kind of file. */
export function isOfficeFile(kind: OfficeKind, bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  try {
    const main = GRAMMARS[kind].main;
    const files = unzipSync(bytes, { filter: (file) => file.name === main });
    return main in files;
  } catch {
    return false;
  }
}

/** The text of every paragraph worth translating, in file order. */
export function extractSegments(
  kind: OfficeKind,
  bytes: Uint8Array,
): string[] {
  const segments: string[] = [];
  const files = unzipSync(bytes, {
    filter: (file) => GRAMMARS[kind].parts.test(file.name),
  });
  for (const data of Object.values(files)) {
    rewrite(kind, strFromU8(data), (text) => {
      segments.push(text);
      return text;
    });
  }
  return segments;
}

/**
 * The file with each segment replaced by its translation, in the order
 * `extractSegments` gave them. Every other entry is copied unchanged.
 */
export function applyTranslations(
  kind: OfficeKind,
  bytes: Uint8Array,
  translations: readonly string[],
): Uint8Array {
  let next = 0;
  const out: Zippable = {};
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    if (GRAMMARS[kind].parts.test(name)) {
      const xml = rewrite(kind, strFromU8(data), (text) => {
        const translated = translations[next++];
        return translated ?? text;
      });
      out[name] = strToU8(xml);
    } else {
      out[name] = data;
    }
  }
  return zipSync(out);
}

function rewrite(
  kind: OfficeKind,
  xml: string,
  translate: (text: string) => string,
): string {
  const { paragraph: paragraphs, tag } = GRAMMARS[kind];
  return xml.replace(paragraphs, (paragraph) => {
    const runs = [...paragraph.matchAll(textPattern(tag))];
    const text = runs.map((run) => decode(run[2] ?? "")).join("");
    if (!/\p{L}/u.test(text)) return paragraph;
    const translated = translate(text);
    let first = true;
    return paragraph.replace(
      textPattern(tag),
      (_run, attributes: string | undefined) => {
        const attrs = attributes ?? "";
        const result = first
          ? `<${tag}${preserveSpace(attrs)}>${encode(translated)}</${tag}>`
          : `<${tag}${attrs}></${tag}>`;
        first = false;
        return result;
      },
    );
  });
}

function preserveSpace(attributes: string): string {
  return attributes.includes("xml:space")
    ? attributes
    : `${attributes} xml:space="preserve"`;
}

function decode(text: string): string {
  return text.replace(
    /&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi,
    (_, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "amp") return "&";
      if (lower === "quot") return '"';
      if (lower === "apos") return "'";
      return String.fromCodePoint(
        lower.startsWith("#x")
          ? parseInt(lower.slice(2), 16)
          : parseInt(lower.slice(1), 10),
      );
    },
  );
}

function encode(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** `report.docx` translated to French is `report.fr.docx`. */
export function translatedName(filename: string, target: string): string {
  const dot = filename.lastIndexOf(".");
  return `${filename.slice(0, dot)}.${target}${filename.slice(dot)}`;
}
