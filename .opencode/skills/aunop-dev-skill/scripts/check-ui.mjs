#!/usr/bin/env node
// ตรวจไฟล์ HTML/CSS ของ mockup หรือหน้าจอ ตามหลักใน references/ux-ui.md และ ui-patterns.md
// ใช้: node check-ui.mjs <ไฟล์.html หรือ .css ...>
//      node check-ui.mjs --contrast <สีข้อความ> <สีพื้นหลัง>     เช่น --contrast "#525252" "#ffffff"
// ผลลัพธ์: path:line [ระดับ] กฎ — คำอธิบาย   exit 1 เมื่อมี error
// เป็นการตรวจรูปแบบข้อความ ไม่เห็นหน้าจอจริง ยังต้องเปิดดูที่ความกว้างมือถือและจอใหญ่

import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const AA_NORMAL = 4.5;
const AA_LARGE = 3;
const MIN_FONT_PX = 14;
const CONTRAST_PAIRS = [
  ["--color-text", "--color-bg"],
  ["--color-text-muted", "--color-bg"],
  ["--color-text", "--color-surface"],
  ["--color-text-muted", "--color-surface"],
  ["--color-on-primary", "--color-primary"],
  ["--color-on-primary", "--color-primary-hover"],
  ["--color-danger", "--color-bg"],
  ["--color-success", "--color-bg"],
  ["--color-primary", "--color-bg"],
  ["--color-warning-text", "--color-warning-bg"],
];

function parseHex(value) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (match === null) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map((digit) => digit + digit).join("");
  return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function luminance([red, green, blue]) {
  const channel = (value) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function runContrast(foregroundText, backgroundText) {
  const foreground = parseHex(foregroundText ?? "");
  const background = parseHex(backgroundText ?? "");
  if (foreground === null || background === null) {
    console.error("ระบุสีเป็น hex เช่น --contrast \"#525252\" \"#ffffff\"");
    process.exit(2);
  }
  const ratio = contrastRatio(foreground, background);
  console.log(`contrast ${foregroundText} บน ${backgroundText} = ${ratio.toFixed(2)}:1`);
  console.log(`ข้อความปกติ (ต้อง ≥ ${AA_NORMAL}): ${ratio >= AA_NORMAL ? "ผ่าน" : "ไม่ผ่าน"}`);
  console.log(`ข้อความใหญ่ ≥ 24px หรือ ≥ 19px ตัวหนา (ต้อง ≥ ${AA_LARGE}): ${ratio >= AA_LARGE ? "ผ่าน" : "ไม่ผ่าน"}`);
  process.exit(ratio >= AA_NORMAL ? 0 : 1);
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkHtml(text, report) {
  if (!/<html[^>]*\slang=/i.test(text)) {
    report(1, "error", "html-lang", 'ใส่ lang ที่ <html> เช่น <html lang="th">');
  }
  if (/<html/i.test(text) && !/<meta[^>]+name=["']viewport["']/i.test(text)) {
    report(1, "error", "viewport", 'ขาด <meta name="viewport" content="width=device-width, initial-scale=1">');
  }
  if (/<html/i.test(text) && !/<title>[^<]+<\/title>/i.test(text)) {
    report(1, "warn", "title", "ขาด <title> ที่บอกชื่อหน้าจอ");
  }

  for (const match of text.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt=/i.test(match[0])) {
      report(lineNumberAt(text, match.index), "error", "img-alt", 'รูปต้องมี alt (รูปตกแต่งใช้ alt="")');
    }
  }

  const labelTargets = new Set([...text.matchAll(/<label\b[^>]*\sfor=["']([^"']+)["']/gi)].map((m) => m[1]));
  const wrappedRanges = [...text.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)].map((m) => [m.index, m.index + m[0].length]);
  for (const match of text.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = match[0];
    if (/\stype=["'](hidden|submit|button|reset|image)["']/i.test(tag)) continue;
    const id = /\sid=["']([^"']+)["']/i.exec(tag);
    const hasFor = id !== null && labelTargets.has(id[1]);
    const hasAria = /\saria-label(ledby)?=/i.test(tag);
    const wrapped = wrappedRanges.some(([start, end]) => match.index > start && match.index < end);
    if (!hasFor && !hasAria && !wrapped) {
      report(lineNumberAt(text, match.index), "error", "field-label", `<${match[1]}> ไม่มี label ที่ผูกกัน ใช้ <label for="id"> และห้ามใช้ placeholder แทน label`);
    }
  }

  for (const match of text.matchAll(/<(div|span|p|li|td)\b[^>]*\sonclick=/gi)) {
    report(lineNumberAt(text, match.index), "warn", "click-target", `<${match[1]} onclick> ใช้คีย์บอร์ดไม่ได้ ให้ใช้ <button> หรือ <a>`);
  }

  for (const match of text.matchAll(/<button\b[^>]*>\s*(ตกลง|OK|Submit|ยืนยัน)\s*<\/button>/gi)) {
    report(lineNumberAt(text, match.index), "warn", "button-copy", `ปุ่ม "${match[1]}" ไม่บอกผล ให้ใช้กริยาที่เจาะจง เช่น "บันทึกการแก้ไข"`);
  }

  const headings = [...text.matchAll(/<h([1-6])\b/gi)].map((m) => ({ level: Number(m[1]), index: m.index }));
  if (/<body/i.test(text) && headings.filter((heading) => heading.level === 1).length !== 1) {
    report(1, "warn", "heading-h1", "ควรมี <h1> หนึ่งอันต่อหน้าจอ");
  }
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level - headings[i - 1].level > 1) {
      report(lineNumberAt(text, headings[i].index), "warn", "heading-order", `ข้ามระดับหัวข้อจาก h${headings[i - 1].level} ไป h${headings[i].level}`);
    }
  }

  for (const match of text.matchAll(/\sstyle=["'][^"']*(#[0-9a-f]{3,8}\b|rgba?\()/gi)) {
    report(lineNumberAt(text, match.index), "warn", "inline-color", "สีใน style attribute ให้ย้ายไปเป็น token");
  }
}

function checkCss(css, baseLine, report) {
  const tokens = new Map();
  const rootBlocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)];
  const rootRanges = rootBlocks.map((m) => [m.index, m.index + m[0].length]);
  for (const block of rootBlocks) {
    for (const declaration of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(declaration[1], declaration[2].trim());
    }
  }
  const inRoot = (index) => rootRanges.some(([start, end]) => index >= start && index < end);
  const lineAt = (index) => baseLine + lineNumberAt(css, index) - 1;

  for (const match of css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi)) {
    if (inRoot(match.index)) continue;
    const lineStart = css.lastIndexOf("\n", match.index) + 1;
    if (/^\s*--[\w-]+\s*:/.test(css.slice(lineStart, match.index))) continue;
    report(lineAt(match.index), "warn", "raw-color", `สี ${match[0]} เขียนตรง ๆ ให้ใช้ var(--color-...)`);
  }

  for (const match of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)) {
    if (Number(match[1]) < MIN_FONT_PX) {
      report(lineAt(match.index), "warn", "font-size", `ตัวอักษร ${match[1]}px เล็กเกินไป ขั้นต่ำ ${MIN_FONT_PX}px`);
    }
  }

  for (const match of css.matchAll(/letter-spacing\s*:\s*([^;]+);/gi)) {
    const value = match[1].trim();
    if (!/^(0|normal|0[a-z%]*|var\(.*\))$/i.test(value) && !value.startsWith("-")) {
      report(lineAt(match.index), "warn", "letter-spacing", "letter-spacing กว้างทำให้ข้อความไทยอ่านยาก");
    }
  }

  for (const match of css.matchAll(/text-transform\s*:\s*uppercase/gi)) {
    report(lineAt(match.index), "warn", "uppercase", "ตัวพิมพ์ใหญ่ล้วนไม่มีผลกับภาษาไทยและอ่านยากในภาษาอังกฤษยาว ๆ");
  }

  for (const match of css.matchAll(/outline\s*:\s*(none|0)\b/gi)) {
    if (!/:focus-visible\s*\{[^}]*(outline|box-shadow)\s*:(?!\s*(none|0)\b)/i.test(css)) {
      report(lineAt(match.index), "error", "focus-visible", "ลบ outline โดยไม่มีสไตล์ :focus-visible ทดแทน ผู้ใช้คีย์บอร์ดจะมองไม่เห็นตำแหน่ง");
    }
  }

  for (const match of css.matchAll(/line-height\s*:\s*(\d+(?:\.\d+)?)\s*;/g)) {
    if (Number(match[1]) < 1.3) {
      report(lineAt(match.index), "warn", "line-height", `line-height ${match[1]} แน่นเกินไปสำหรับข้อความไทย เนื้อหาใช้ 1.5–1.7 หัวข้อไม่ต่ำกว่า 1.3`);
    }
  }

  for (const [foregroundName, backgroundName] of CONTRAST_PAIRS) {
    const foreground = parseHex(tokens.get(foregroundName) ?? "");
    const background = parseHex(tokens.get(backgroundName) ?? "");
    if (foreground === null || background === null) continue;
    const ratio = contrastRatio(foreground, background);
    if (ratio < AA_NORMAL) {
      report(baseLine, "error", "contrast", `${foregroundName} บน ${backgroundName} ได้ ${ratio.toFixed(2)}:1 ต่ำกว่า ${AA_NORMAL}:1`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--contrast") runContrast(args[1], args[2]);
  if (args.length === 0 || args.includes("--help")) {
    console.log("ใช้: node check-ui.mjs <ไฟล์.html หรือ .css ...>\n     node check-ui.mjs --contrast <สีข้อความ> <สีพื้นหลัง>");
    process.exit(args.length === 0 ? 2 : 0);
  }

  let errorCount = 0;
  let warnCount = 0;
  for (const file of args) {
    if (!existsSync(file)) {
      console.error(`ไม่พบ: ${file}`);
      process.exit(2);
    }
    const text = readFileSync(file, "utf8");
    const report = (line, level, rule, message) => {
      if (level === "error") errorCount += 1;
      else warnCount += 1;
      console.log(`${file}:${line} [${level}] ${rule} — ${message}`);
    };
    if (extname(file) === ".css") {
      checkCss(text, 1, report);
      continue;
    }
    checkHtml(text, report);
    for (const style of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      const offset = style.index + style[0].indexOf(style[1]);
      checkCss(style[1], lineNumberAt(text, offset), report);
    }
  }
  console.log(`\nตรวจ ${args.length} ไฟล์: error ${errorCount}, warn ${warnCount}`);
  process.exit(errorCount > 0 ? 1 : 0);
}

main();
