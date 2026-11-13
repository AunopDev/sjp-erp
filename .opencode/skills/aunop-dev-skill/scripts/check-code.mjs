#!/usr/bin/env node
// ตรวจโค้ด TypeScript/JavaScript ตามมาตรฐานใน references/coding-standards.md
// ใช้: node check-code.mjs [ไฟล์หรือโฟลเดอร์ ...]   (ไม่ระบุ = src ถ้ามี ไม่งั้นโฟลเดอร์ปัจจุบัน)
// ผลลัพธ์: รายการ path:line [ระดับ] กฎ — คำอธิบาย   exit 1 เมื่อมี error, 0 เมื่อไม่มี
// เป็นการตรวจด้วยรูปแบบข้อความ จับได้เฉพาะรูปแบบที่ระบุไว้ ไม่ทดแทน typecheck, lint และ test ของโปรเจ็กต์

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, basename } from "node:path";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules", "dist", "build", "out", "coverage", ".git", ".next", ".turbo", "vendor",
]);
const CONFIG_FILE_PATTERN = /(config|constant|constants|env|settings)\b|\.config\./i;
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$|__tests__/;
const CONSTANT_EXPRESSION = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)*$/;
const SQL_STATEMENT = /\b(SELECT\b[\s\S]*\bFROM\b|INSERT\s+INTO\b|UPDATE\b[\s\S]*\bSET\b|DELETE\s+FROM\b)/i;

const LINE_RULES = [
  {
    id: "no-any",
    level: "error",
    pattern: /(:\s*any\b|\bas\s+any\b|<any\s*>|\bany\s*\[\]|<any\s*,|,\s*any\s*>)/,
    message: "ห้ามใช้ any ให้กำหนด type ที่ชัดเจนหรือใช้ unknown แล้วตรวจด้วย schema (ข้อ 2)",
  },
  {
    id: "no-unsafe-cast",
    level: "error",
    pattern: /\bas\s+unknown\b/,
    message: "ห้าม cast ผ่าน unknown ให้ validate ด้วย schema แทน (ข้อ 2, 4)",
  },
  {
    id: "no-ts-suppress",
    level: "error",
    pattern: /@ts-ignore|@ts-nocheck/,
    message: "ห้ามปิดการตรวจ type ให้แก้ที่สาเหตุ (ข้อ 2)",
    includeComments: true,
  },
  {
    id: "no-placeholder",
    level: "error",
    pattern: /\/\/\s*(TODO|FIXME)\b|implement\s+later|\.\.\.\s*(rest\s+of|existing)\s+code/i,
    message: "ห้ามทิ้ง placeholder โค้ดต้องทำงานครบ (กฎพฤติกรรม Agent)",
    includeComments: true,
  },
  {
    id: "select-star",
    level: "warn",
    pattern: /\bSELECT\s+\*/i,
    message: "ระบุคอลัมน์ที่ใช้แทน SELECT * (ข้อ 14)",
  },
  {
    id: "sql-concat",
    level: "error",
    pattern: /["'][^"']*\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^"']*["']\s*\+/i,
    message: "ห้ามต่อ string สร้าง SQL ให้ใช้ parameterized query (ข้อ 11)",
  },
  {
    id: "console-log",
    level: "warn",
    pattern: /\bconsole\.(log|debug)\s*\(/,
    message: "ใช้ logger ของโปรเจ็กต์แทน console.log และห้าม log ข้อมูลลับ (ข้อ 13)",
    skipTests: true,
  },
  {
    id: "hardcoded-url",
    level: "warn",
    pattern: /["'`]https?:\/\/[^"'`\s]+/,
    message: "ย้าย URL ไปไว้ใน config หรือ constant (ข้อ 7)",
    skipConfig: true,
    skipTests: true,
  },
  {
    id: "floating-promise-then",
    level: "warn",
    pattern: /\)\s*\.then\s*\([^)]*\)\s*;?\s*$/,
    message: "promise ที่ใช้ .then โดยไม่มี .catch หรือ await อาจกลายเป็น unhandled rejection (ข้อ 12)",
  },
];

function collectFiles(target, found) {
  const stats = statSync(target);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue;
      collectFiles(join(target, entry), found);
    }
    return;
  }
  if (CODE_EXTENSIONS.has(extname(target))) found.push(target);
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function checkLines(file, text, report) {
  const isConfig = CONFIG_FILE_PATTERN.test(basename(file));
  const isTest = TEST_FILE_PATTERN.test(file);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const comment = isCommentLine(line);
    for (const rule of LINE_RULES) {
      if (comment && rule.includeComments !== true) continue;
      if (rule.skipConfig === true && isConfig) continue;
      if (rule.skipTests === true && isTest) continue;
      if (rule.pattern.test(line)) {
        report(file, index + 1, rule.level, rule.id, rule.message);
      }
    }
  });
}

function checkEmptyCatch(file, text, report) {
  const pattern = /catch\s*(\([^)]*\))?\s*\{(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*\}/g;
  for (const match of text.matchAll(pattern)) {
    report(
      file,
      lineNumberAt(text, match.index),
      "error",
      "empty-catch",
      "ห้ามกลืน error ให้จัดการ เพิ่มบริบทแล้วโยนต่อ หรือปล่อยให้ตัวจัดการกลางรับ (ข้อ 8)",
    );
  }
}

function checkSqlTemplates(file, text, report) {
  const templatePattern = /`(?:[^`\\]|\\[\s\S])*`/g;
  for (const template of text.matchAll(templatePattern)) {
    const body = template[0];
    if (!SQL_STATEMENT.test(body)) continue;
    for (const interpolation of body.matchAll(/\$\{([^}]*)\}/g)) {
      const expression = interpolation[1].trim();
      if (CONSTANT_EXPRESSION.test(expression)) continue;
      // ตำแหน่งที่เป็น "ค่า" (หลังตัวเปรียบเทียบ ในเครื่องหมายคำพูด ใน IN/VALUES) ถือเป็น error
      // ตำแหน่งอื่นอาจเป็นชิ้นส่วน SQL ที่ประกอบจากข้อความคงที่ จึงเป็น warn ให้ตรวจด้วยตา
      const before = body.slice(0, interpolation.index);
      const isValuePosition = /(=|<|>|!|\bLIKE|\bIN\s*\(|\bVALUES\s*\([^)]*|\bLIMIT|\bOFFSET)\s*['"%]*$/i.test(before);
      const line = lineNumberAt(text, template.index + interpolation.index);
      if (isValuePosition) {
        report(file, line, "error", "sql-interpolation",
          `ค่า \${${expression}} ถูกแทรกลงใน SQL ในตำแหน่งของค่า ให้ส่งผ่าน parameter แทน (ข้อ 11)`);
      } else {
        report(file, line, "warn", "sql-fragment",
          `\${${expression}} ถูกแทรกลงใน SQL ตรวจว่าเป็นชิ้นส่วนที่ประกอบจากข้อความคงที่และ placeholder เท่านั้น ไม่มีค่าจากผู้ใช้ (ข้อ 11)`);
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("ใช้: node check-code.mjs [ไฟล์หรือโฟลเดอร์ ...]");
    process.exit(0);
  }
  const targets = args.length > 0 ? args : [existsSync("src") ? "src" : "."];
  const files = [];
  for (const target of targets) {
    if (!existsSync(target)) {
      console.error(`ไม่พบ: ${target}`);
      process.exit(2);
    }
    collectFiles(target, files);
  }

  const findings = [];
  const report = (file, line, level, rule, message) => {
    findings.push({ file: relative(process.cwd(), file) || file, line, level, rule, message });
  };

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    checkLines(file, text, report);
    checkEmptyCatch(file, text, report);
    checkSqlTemplates(file, text, report);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line} [${finding.level}] ${finding.rule} — ${finding.message}`);
  }
  const errorCount = findings.filter((finding) => finding.level === "error").length;
  const warnCount = findings.length - errorCount;
  console.log(`\nตรวจ ${files.length} ไฟล์: error ${errorCount}, warn ${warnCount}`);
  if (files.length === 0) console.log("ไม่พบไฟล์โค้ดในเส้นทางที่ระบุ ตรวจว่าระบุ path ถูกหรือไม่");
  process.exit(errorCount > 0 ? 1 : 0);
}

main();
