#!/usr/bin/env node
// ตรวจบล็อก ```mermaid ในไฟล์ markdown หาข้อผิดพลาดที่ทำให้ render ไม่ขึ้นหรือแบบไม่ครบ
// ใช้: node check-mermaid.mjs <ไฟล์.md หรือโฟลเดอร์ ...>
// ผลลัพธ์: path:line [ระดับ] กฎ — คำอธิบาย   exit 1 เมื่อมี error
// เป็นการตรวจรูปแบบ ไม่ใช่ตัว render จริง ผ่านสคริปต์นี้แล้วยังควร render ดูถ้ามีเครื่องมือ

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const DIAGRAM_TYPES = /^(flowchart|graph|sequenceDiagram|stateDiagram-v2|stateDiagram|erDiagram|classDiagram|gantt|journey|pie|mindmap|timeline)\b/;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build"]);
const ARROW = /(--[^->|]+-->|-\.[^.>|]+\.->|==[^=>|]+==>|-->|---|-\.->|==>|--o|--x)/;
const VALID_ID = /^[A-Za-z_][\w-]*$/;

function collectFiles(target, found) {
  const stats = statSync(target);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue;
      collectFiles(join(target, entry), found);
    }
    return;
  }
  if ([".md", ".mdx", ".mmd"].includes(extname(target))) found.push(target);
}

function extractBlocks(file, text) {
  if (extname(file) === ".mmd") return [{ startLine: 1, lines: text.split(/\r?\n/) }];
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  lines.forEach((line, index) => {
    if (current === null) {
      if (/^\s*```mermaid\s*$/.test(line)) current = { startLine: index + 2, lines: [] };
    } else if (/^\s*```\s*$/.test(line)) {
      blocks.push(current);
      current = null;
    } else {
      current.lines.push(line);
    }
  });
  return blocks;
}

const CLOSERS = { "[": "]", "(": ")", "{": "}" };

// คืน { stripped, labels } โดยแทนป้ายในวงเล็บของ node ด้วยช่องว่าง และเก็บข้อมูลป้ายไว้ตรวจ
function stripNodeLabels(line) {
  let stripped = "";
  const labels = [];
  let i = 0;
  while (i < line.length) {
    const char = line[i];
    const previous = stripped[stripped.length - 1];
    const opensLabel = char in CLOSERS && previous !== undefined && /[\w-]/.test(previous);
    if (!opensLabel) {
      stripped += char;
      i += 1;
      continue;
    }
    // อ่านจนถึงตัวปิดที่สมดุล โดยข้ามข้อความในเครื่องหมายคำพูด
    let depth = 0;
    let j = i;
    let inQuote = false;
    for (; j < line.length; j += 1) {
      const c = line[j];
      if (c === '"') inQuote = !inQuote;
      if (inQuote) continue;
      if (c in CLOSERS) depth += 1;
      if (c === "]" || c === ")" || c === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const raw = line.slice(i, j + 1);
    labels.push({ raw, opener: char, closed: depth === 0 && j < line.length });
    stripped += " ";
    i = j + 1;
  }
  return { stripped, labels };
}

function innerLabel(raw) {
  let text = raw;
  // ลอกวงเล็บรูปร่างออกได้สูงสุดสองชั้น เช่น ([..]) ((..)) [(..)] {{..}}
  for (let layer = 0; layer < 2; layer += 1) {
    const first = text[0];
    const last = text[text.length - 1];
    if (first in CLOSERS && (last === "]" || last === ")" || last === "}")) {
      text = text.slice(1, -1);
    } else {
      break;
    }
    const next = text[0];
    if (!(next in CLOSERS)) break;
  }
  return text.trim();
}

function checkFlowchart(block, report) {
  const defined = new Map(); // id -> { line, decision }
  const connected = new Set();
  const outgoing = new Map(); // id -> [{ labeled }]
  let subgraphs = 0;
  let ends = 0;

  block.lines.slice(1).forEach((rawLine, offset) => {
    const lineNumber = block.startLine + offset + 1;
    const line = rawLine.replace(/%%.*$/, "");
    const trimmed = line.trim();
    if (trimmed === "") return;
    if (/^subgraph\b/.test(trimmed)) { subgraphs += 1; return; }
    if (trimmed === "end") { ends += 1; return; }
    if (/^(direction|classDef|class|style|linkStyle|click)\b/.test(trimmed)) return;

    const { stripped, labels } = stripNodeLabels(line);
    for (const label of labels) {
      if (!label.closed) {
        report(lineNumber, "error", "unclosed-label", `วงเล็บของป้ายไม่ปิด: ${label.raw}`);
        continue;
      }
      const inner = innerLabel(label.raw);
      const quoted = inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2;
      if (!quoted && /[()[\]{}"#:;]/.test(inner)) {
        report(lineNumber, "error", "unquoted-label", `ป้าย ${label.raw} มีอักขระพิเศษ ให้ครอบข้อความด้วย "..."`);
      }
    }

    // เก็บ id ที่ประกาศพร้อมรูปร่าง
    for (const match of line.matchAll(/([A-Za-z_][\w-]*)\s*([[({])/g)) {
      if (!defined.has(match[1])) defined.set(match[1], { line: lineNumber, decision: match[2] === "{" });
      else if (match[2] === "{") defined.get(match[1]).decision = true;
    }

    if (!ARROW.test(stripped)) return;
    const parts = stripped.split(ARROW);
    // parts: [node, arrow, node, arrow, node ...]
    for (let index = 0; index < parts.length; index += 2) {
      const segment = parts[index].replace(/\|[^|]*\|/g, " ").trim();
      const ids = segment.split("&").map((part) => part.trim()).filter((part) => part !== "");
      for (const id of ids) {
        if (id === "end") {
          report(lineNumber, "error", "reserved-id", 'ห้ามใช้ "end" เป็น id ของ node ให้เปลี่ยนชื่อ เช่น done');
          continue;
        }
        if (!VALID_ID.test(id)) {
          report(lineNumber, "warn", "node-id", `id "${id}" ควรเป็นตัวอักษรอังกฤษ ตัวเลข หรือ _ และข้อความไทยให้อยู่ในป้าย`);
          continue;
        }
        connected.add(id);
        if (!defined.has(id)) defined.set(id, { line: lineNumber, decision: false });
      }
      const arrow = parts[index + 1];
      if (arrow === undefined) continue;
      const nextSegment = parts[index + 2] ?? "";
      const labeled = /[^\-.=>ox\s]/.test(arrow) || /^\s*\|[^|]+\|/.test(nextSegment);
      for (const id of ids) {
        if (!VALID_ID.test(id)) continue;
        if (!outgoing.has(id)) outgoing.set(id, []);
        outgoing.get(id).push({ labeled, line: lineNumber });
      }
    }
  });

  if (subgraphs !== ends) {
    report(block.startLine, "error", "subgraph-end", `subgraph ${subgraphs} อัน แต่มี end ${ends} อัน ต้องเท่ากัน`);
  }
  for (const [id, info] of defined) {
    if (!connected.has(id)) {
      report(info.line, "warn", "orphan-node", `node "${id}" ไม่มีเส้นเชื่อม`);
    }
    if (info.decision) {
      const edges = outgoing.get(id) ?? [];
      if (edges.length < 2) {
        report(info.line, "warn", "decision-branches", `จุดตัดสินใจ "${id}" มีทางออก ${edges.length} ทาง ควรมีอย่างน้อย 2`);
      }
      for (const edge of edges) {
        if (!edge.labeled) {
          report(edge.line, "warn", "decision-label", `เส้นออกจากจุดตัดสินใจ "${id}" ไม่มีป้ายกำกับ`);
        }
      }
    }
  }
}

function checkStateDiagram(block, report) {
  const sources = new Set();
  const targets = new Set();
  block.lines.slice(1).forEach((rawLine, offset) => {
    const lineNumber = block.startLine + offset + 1;
    const line = rawLine.replace(/%%.*$/, "").trim();
    if (!line.includes("-->")) return;
    const match = /^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)\s*(:.*)?$/.exec(line);
    if (match === null) {
      report(lineNumber, "error", "state-transition", "รูปแบบต้องเป็น STATE_A --> STATE_B: เหตุการณ์ และชื่อสถานะห้ามมีช่องว่างหรืออักขระพิเศษ");
      return;
    }
    sources.add(match[1]);
    targets.add(match[2]);
  });
  if (!sources.has("[*]")) report(block.startLine, "warn", "state-start", "ไม่มีจุดเริ่ม [*] --> สถานะแรก");
  for (const state of targets) {
    if (state !== "[*]" && !sources.has(state)) {
      report(block.startLine, "warn", "state-dead-end", `สถานะ "${state}" ไม่มีทางออก ถ้าเป็นสถานะสุดท้ายให้เขียน ${state} --> [*]`);
    }
  }
}

function checkSequence(block, report) {
  let depth = 0;
  block.lines.slice(1).forEach((rawLine, offset) => {
    const line = rawLine.trim();
    if (/^(alt|opt|loop|par|critical|break|rect)\b/.test(line)) depth += 1;
    if (line === "end") depth -= 1;
    if (depth < 0) {
      report(block.startLine + offset + 1, "error", "sequence-end", "มี end เกินจำนวนบล็อก alt/opt/loop");
      depth = 0;
    }
  });
  if (depth > 0) report(block.startLine, "error", "sequence-end", `บล็อก alt/opt/loop ${depth} อันยังไม่ปิดด้วย end`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log("ใช้: node check-mermaid.mjs <ไฟล์.md หรือโฟลเดอร์ ...>");
    process.exit(args.length === 0 ? 2 : 0);
  }
  const files = [];
  for (const target of args) {
    if (!existsSync(target)) {
      console.error(`ไม่พบ: ${target}`);
      process.exit(2);
    }
    collectFiles(target, files);
  }

  let errorCount = 0;
  let warnCount = 0;
  let blockCount = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const block of extractBlocks(file, text)) {
      blockCount += 1;
      const report = (line, level, rule, message) => {
        if (level === "error") errorCount += 1;
        else warnCount += 1;
        console.log(`${relative(process.cwd(), file) || file}:${line} [${level}] ${rule} — ${message}`);
      };
      const header = (block.lines.find((line) => line.trim() !== "") ?? "").trim();
      const type = DIAGRAM_TYPES.exec(header);
      if (type === null) {
        report(block.startLine, "error", "diagram-type", `บรรทัดแรกต้องเป็นชนิดแผนภาพ เช่น flowchart TD แต่พบ "${header}"`);
        continue;
      }
      const firstIndex = block.lines.findIndex((line) => line.trim() !== "");
      const normalized = { startLine: block.startLine + firstIndex, lines: block.lines.slice(firstIndex) };
      if (type[1] === "flowchart" || type[1] === "graph") checkFlowchart(normalized, report);
      if (type[1].startsWith("stateDiagram")) checkStateDiagram(normalized, report);
      if (type[1] === "sequenceDiagram") checkSequence(normalized, report);
    }
  }
  console.log(`\nตรวจ ${blockCount} แผนภาพใน ${files.length} ไฟล์: error ${errorCount}, warn ${warnCount}`);
  if (blockCount === 0) console.log("ไม่พบบล็อก ```mermaid ตรวจว่าระบุไฟล์ถูกหรือไม่");
  process.exit(errorCount > 0 ? 1 : 0);
}

main();
