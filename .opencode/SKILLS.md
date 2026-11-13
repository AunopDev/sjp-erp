# OpenCode skills for SJP ERP

ชุดสกิลที่ vendor ไว้ในโปรเจ็ค เพื่อให้ทุกคนที่เปิด repo นี้ได้ใช้ชุดเดียวกันโดยไม่ต้องติดตั้ง global

## ติดตั้งอะไรไว้บ้าง

ติดตั้ง **48 สกิล** จาก 6 repo (คัดเฉพาะชุดที่เกี่ยวกับ UI/UX, Angular, architecture และ playbook ของเจ้าของ):

| ต้นทาง | จำนวน | ใช้อะไร |
| --- | --- | --- |
| [AunopDev/aunop-dev-skill](https://github.com/AunopDev/aunop-dev-skill) | 1 | `aunop-dev-skill` — playbook โค้ด/flow/UX-UI + check scripts |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 1 | `ui-ux-pro-max` — design intelligence + search tool |
| [jakubkrehel/skills](https://github.com/jakubkrehel/skills) | 10 | `better-*`, `interface-review`, `build-design`, `explain-interface` |
| [jpoindexter/ux-flow-skills](https://github.com/jpoindexter/ux-flow-skills) | 16 | `userflow` + `flow-*` (auth, tables, forms, settings, errors, …) |
| [konraddzbik/architecture-diagram-skill](https://github.com/konraddzbik/architecture-diagram-skill) | 1 | `architecture-diagram` — interactive HTML diagram |
| [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | 19 | `ui-*`, `ux-audit`, `angular-*`, `wcag-audit-patterns`, `kpi-dashboard-design`, … |

> `agentic-awesome-skills` มี ~3,000 สกิล (~100 MB) — เราเลือกเฉพาะ 19 ตัวที่เกี่ยวกับโปรเจ็ค ไม่ได้ vendor ทั้ง repo

รายการที่ติดตั้งจริงและ commit ที่ pin ไว้อยู่ใน [`skills-manifest.json`](skills-manifest.json)

## วิธีใช้

- เปิด OpenCode ใน repo นี้ — project skills จะถูก discovery อัตโนมัติจาก `.opencode/skills/`
- เรียกด้วยชื่อ เช่น `@ui-ux-pro-max`, `@better-interface`, `@flow-tables`, `@architecture-diagram`
- หรือให้ agent เลือกเองเมื่อ prompt ตรงกับ description ของสกิล
- `ui-ux-pro-max` มี search tool — ใช้ path ของโปรเจ็คนี้:
  `python .opencode/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux`
- `aunop-dev-skill` มี check scripts (Node ไม่ต้องติดตั้งเพิ่ม):
  ```powershell
  node .opencode/skills/aunop-dev-skill/scripts/check-code.mjs <ไฟล์หรือโฟลเดอร์>
  node .opencode/skills/aunop-dev-skill/scripts/check-ui.mjs <ไฟล์.html>
  node .opencode/skills/aunop-dev-skill/scripts/check-mermaid.mjs <ไฟล์.md>
  ```
  ใช้สกิลนี้เป็น playbook เริ่มงานโค้ด/flow/หน้าจอของโปรเจ็คนี้

## อัปเดต / เพิ่มสกิล

```powershell
# sync ตาม commit ที่ pin ไว้ ( reproducible )
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-opencode-skills.ps1

# ตรวจว่าติดตั้งครบ
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-opencode-skills.ps1 -Check
```

- แก้รายการสกิล/commit ที่ `.opencode/skills-manifest.json` แล้วรัน sync
- อย่าแก้ไฟล์ใน `.opencode/skills/<id>/` โดยตรง — รัน sync รอบถัดไปจะทับ
- ถ้าต้องการสกิลใหม่จาก agentic repo ให้เพิ่มชื่อโฟลเดอร์ใน manifest (ดูรายชื่อที่ `https://github.com/sickn33/agentic-awesome-skills/tree/main/skills`)

## License

สกิลแต่ละตัวมี license ของต้นทาง เก็บไว้ที่ `.opencode/skills/.licenses/<repo>/` (โฟลเดอร์ขึ้นต้นด้วย `.` จะไม่ถูก discovery)
