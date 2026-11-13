---
name: aunop-dev-skill
description: "Owner's personal development playbook covering three kinds of work: (1) writing, fixing, refactoring or reviewing code (TypeScript-first; the principles apply to any language), (2) planning features and designing user flows, business processes, system workflows, state machines, architecture and data contracts, and (3) designing UX/UI screens, wireframes, mockups and UI code. Use this skill whenever a task involves code, a flow or process, system design, or a screen or interface, including Thai requests such as เขียนโค้ด, แก้บั๊ก, รีวิวโค้ด, วางแผนฟีเจอร์, ออกแบบโฟลว, ออกแบบระบบ, กระบวนการทำงาน, ออกแบบหน้าจอ, UX/UI, even when the owner does not name the skill."
---

# แนวทางพัฒนาของเจ้าของ

สกิลนี้รวมวิธีคิด ขั้นตอน และมาตรฐานของเจ้าของสำหรับงานสามกลุ่ม: โค้ด, flow และกระบวนการของระบบ, และหน้าจอ UX/UI ไฟล์นี้เป็นตัวนำทาง รายละเอียดอยู่ใน `references/` ให้อ่านเฉพาะไฟล์ที่งานตรงหน้าต้องใช้ เพื่อไม่ให้ context เต็มไปด้วยกฎที่ไม่เกี่ยว

ตัวอย่างในไฟล์อ้างอิงเป็นแบบของรูปแบบและระดับความละเอียด ไม่ใช่คำสั่งให้ย้ายไฟล์ จัดโปรเจ็กต์ใหม่ หรือคัดลอกชื่อไปใช้

## เริ่มงานทุกครั้ง

ทำตามลำดับก่อนเขียนคำตอบหรือแก้ไฟล์ใด ๆ

0. **อ่าน [owner-profile.md](references/owner-profile.md)** หนึ่งครั้งต่อ session: ค่าที่เจ้าของตัดสินใจแล้ว และเรื่องที่ต้องถามเจ้าของทุกโปรเจ็กต์
1. **ระบุชนิดและขนาดงาน** จากตารางด้านล่าง งานหนึ่งอาจมีหลายชนิด
2. **อ่านไฟล์อ้างอิงของชนิดนั้น** ให้จบก่อนเริ่ม ไม่ทำจากความจำว่าไฟล์น่าจะเขียนอะไร
3. **แปลงคำขอเป็นสเปก:** เจ้าของสั่งงานด้วยภาษาง่าย ๆ งานขนาดกลางขึ้นไปให้ทำตาม [requirements.md](references/requirements.md) คือเขียนความเข้าใจออกมา หาช่องว่างของคำขอ และถ้ามีจุดที่ไม่เข้าใจหรือตีความได้หลายทาง ให้ถามเจ้าของก่อนลงมือ งานเล็ก (แก้บรรทัดเดียว, ตอบคำถาม) ข้ามข้อนี้ได้
4. **ทำงานแบบประหยัด:** ค้นก่อนอ่าน จำกัดผลลัพธ์ของคำสั่ง ไม่อ่านหรือรันซ้ำ ตาม [agent-efficiency.md](references/agent-efficiency.md)

## เลือกไฟล์ตามงาน

| งาน | อ่านตามลำดับ |
| --- | --- |
| รับคำขอสั้น ๆ แล้วต้องทำสเปกละเอียด ถามกลับ หรือส่งงานต่อให้เอเจนต์/คนอื่น | [requirements.md](references/requirements.md) |
| เริ่มโปรเจ็กต์ใหม่ หรือเลือกเครื่องมือ framework ฐานข้อมูล library | [tech-stack.md](references/tech-stack.md) |
| สร้างโปรเจ็กต์ วางโฟลเดอร์ หรือไม่แน่ใจว่าไฟล์ใหม่อยู่ที่ไหน (แนว Angular, NestJS) | [project-structure.md](references/project-structure.md) |
| ยังไม่รู้จักโปรเจ็กต์ | [coding-playbooks.md](references/coding-playbooks.md) หัวข้อ A |
| เขียนฟีเจอร์ใหม่ | [coding-playbooks.md](references/coding-playbooks.md) หัวข้อ B → [project-flow.md](references/project-flow.md) → [coding-standards.md](references/coding-standards.md) → [code-examples.md](references/code-examples.md) |
| แก้บั๊ก | [coding-playbooks.md](references/coding-playbooks.md) หัวข้อ C → [coding-standards.md](references/coding-standards.md) |
| Refactor | [coding-playbooks.md](references/coding-playbooks.md) หัวข้อ D → [coding-standards.md](references/coding-standards.md) |
| รีวิวโค้ด | [coding-playbooks.md](references/coding-playbooks.md) หัวข้อ E → [coding-standards.md](references/coding-standards.md) |
| เขียน test | [coding-playbooks.md](references/coding-playbooks.md) หัวข้อ F → [code-examples.md](references/code-examples.md) หัวข้อ 12 |
| ออกแบบ user flow, business process, state machine, sequence, ER, สถาปัตยกรรม | [system-design.md](references/system-design.md) |
| ออกแบบหน้าจอ wireframe mockup หรือเขียน UI (ต้อง responsive และใช้ง่าย) | [ux-ui.md](references/ux-ui.md) → [ui-patterns.md](references/ui-patterns.md) รวมหัวข้อ 7 และ 8 |
| ออกแบบหรือเปลี่ยน endpoint, event, contract ระหว่างระบบ | [api-design.md](references/api-design.md) |
| ออกแบบตาราง index query หรือเขียน migration | [database-design.md](references/database-design.md) |
| งานที่แตะการเข้าสู่ระบบ สิทธิ์ ข้อมูลผู้ใช้ ไฟล์อัปโหลด ความลับ | [security.md](references/security.md) |
| Firmware ESP32 ไมโครคอนโทรลเลอร์ หรือระบบที่รับข้อมูลจากอุปกรณ์ | [iot-esp32.md](references/iot-esp32.md) |
| commit, branch, pull request | [git-workflow.md](references/git-workflow.md) |
| อยากเห็นตัวอย่างงานทั้งเส้นตั้งแต่โจทย์ถึงรายงาน | [worked-example.md](references/worked-example.md) |
| การตัดสินใจที่ย้อนยาก หรือไม่แน่ใจว่าควรทำอย่างไร | [thinking.md](references/thinking.md) |
| ก่อนส่งมอบทุกงาน | [review-checklist.md](references/review-checklist.md) เฉพาะหมวดที่เกี่ยว |

งานจริงมักข้ามกลุ่ม ฟีเจอร์ใหม่ที่มีหน้าจอให้เดินตามลำดับ flow → ข้อมูลและ contract → หน้าจอ → โค้ด เพราะแต่ละขั้นกำหนดขั้นถัดไป หน้าจอที่ออกแบบก่อนรู้ flow มักขาดหน้า และโค้ดที่เขียนก่อนรู้ contract มักต้องรื้อ

## สคริปต์ตรวจ

สคริปต์ใน `scripts/` ตรวจข้อผิดพลาดที่พบบ่อยให้โดยไม่ต้องอาศัยการสังเกต รันด้วย Node ไม่ต้องติดตั้งอะไรเพิ่ม ให้รันก่อนส่งงานทุกครั้งที่มีผลงานชนิดนั้น แล้วใส่ผลจริงในรายงาน แทน `<skill>` ด้วย path ของโฟลเดอร์สกิลนี้

| ผลงาน | คำสั่ง |
| --- | --- |
| โค้ด TypeScript/JavaScript | `node <skill>/scripts/check-code.mjs <ไฟล์หรือโฟลเดอร์ที่แก้>` |
| แผนภาพ Mermaid ในไฟล์ markdown | `node <skill>/scripts/check-mermaid.mjs <ไฟล์.md>` |
| mockup หรือหน้าจอ HTML/CSS | `node <skill>/scripts/check-ui.mjs <ไฟล์.html>` |
| คู่สีข้อความกับพื้นหลัง | `node <skill>/scripts/check-ui.mjs --contrast "#สีข้อความ" "#สีพื้น"` |

- `[error]` ต้องแก้ให้หมดก่อนส่ง `[warn]` ให้แก้ หรือระบุเหตุผลในรายงานว่าทำไมไม่แก้
- สคริปต์ตรวจด้วยรูปแบบข้อความ จึงจับได้เฉพาะรูปแบบที่รู้จัก ผ่านสคริปต์แล้วยังต้องรัน typecheck, lint, test ของโปรเจ็กต์ และตรวจตาม checklist
- ถ้าสคริปต์แจ้งผิดในจุดที่ถูกอยู่แล้ว ให้คงโค้ดไว้และแจ้งเจ้าของในรายงาน ไม่บิดโค้ดเพื่อหลบสคริปต์
- ถ้า session รันคำสั่งไม่ได้ ให้ตรวจด้วยมือตามกฎเดียวกัน และระบุว่าไม่ได้รันสคริปต์

## วิธีคิดหลัก

ทำตามนี้กับทุกงาน ปรับความลึกตามขนาดและความเสี่ยง แบบฟอร์มและตัวอย่างอยู่ใน [thinking.md](references/thinking.md)

1. **เข้าใจโจทย์จริง:** ใครต้องการอะไร เพื่ออะไร และเสร็จแล้วหน้าตาเป็นอย่างไร แยกข้อเท็จจริง สมมติฐาน และคำถามค้าง
2. **ดูของจริงก่อน:** อ่านคำสั่งผู้ใช้ AGENTS.md หรือ CLAUDE.md ของโปรเจ็กต์ โครงสร้าง เครื่องมือ dependency และแนวทางเดิม ก่อนเสนอหรือแก้อะไร ไม่เดาจากความจำ
3. **หาทางเลือก:** การตัดสินใจที่ย้อนยากให้เทียบอย่างน้อยสองทาง เลือกทางที่ง่ายที่สุดที่ตอบโจทย์ปัจจุบัน พร้อมเหตุผล
4. **คิดเส้นทางที่พัง:** ข้อมูลผิด ไม่มีสิทธิ์ ส่งซ้ำ ทำพร้อมกัน ระบบภายนอกล้ม ไม่ใช่แค่เส้นทางสำเร็จ
5. **ลงมือเป็นก้าวเล็ก** ที่ตรวจได้ทีละก้าว
6. **ตรวจด้วยหลักฐาน:** รันจริง ไล่ตัวอย่างด้วยมือ และอ่านงานอีกรอบในฐานะผู้รีวิว
7. **วิจารณ์ตัวเองก่อนส่ง:** จุดไหนอ่อนที่สุด อะไรยังไม่ได้ตรวจ ทำเกินหรือขาดจากที่ขอหรือไม่

## กติการ่วมทุกงาน

- แก้เฉพาะส่วนที่เกี่ยวข้อง ไม่ refactor ส่วนอื่นแถม เพราะเจ้าของต้องรีวิวทุกบรรทัดที่เปลี่ยน
- ใช้เครื่องมือ component และ convention ที่โปรเจ็กต์มีอยู่ ห้ามติดตั้งหรือเสนอ package ใหม่โดยไม่ได้รับอนุญาต
- ไม่เขียนชื่อฟังก์ชัน ไฟล์ option หรือ API จากความจำ ให้ค้นหรือเปิดดูว่ามีจริงก่อนใช้
- ชื่อฐานข้อมูล: ตารางลงท้าย `_tb` คอลัมน์ขึ้นต้นด้วยชื่อข้อมูลของตาราง เช่น `test_tb` มี `test_id`, `test_name`, `test_create_date`, `test_update_date` รายละเอียดใน [coding-standards.md](references/coding-standards.md)
- วันที่บนหน้าจอเป็น `dd/MM/yyyy` ภาษาไทยใช้ปี พ.ศ. ภาษาอังกฤษใช้ปี ค.ศ. หน้าจอเป็นสองภาษาไทยและอังกฤษ คอมเมนต์ในโค้ดเขียนไทย ข้อความ commit เขียนอังกฤษ
- Tech stack ฐานข้อมูล สีและแนวหน้าตา และที่รันระบบ เจ้าของกำหนดเป็นรายโปรเจ็กต์ ต้องถามหรืออ่านจากโปรเจ็กต์ ห้ามเลือกเอง
- หน้าจอทุกหน้าต้องใช้ได้ตั้งแต่จอมือถือถึงจอคอม และผ่านรายการตรวจความใช้ง่ายใน [ui-patterns.md](references/ui-patterns.md)
- งานโค้ดให้ออกแบบ schema และ contract ก่อน business logic แยก repository และตรวจข้อมูลจากภายนอก ตามมาตรฐานโค้ด
- โค้ดที่ส่งต้องทำงานครบ ไม่มี placeholder เช่น `// TODO` หรือ `// ... rest of code`
- มาตรฐานโค้ดเขียนโดยยึด TypeScript และ Zod เมื่อโปรเจ็กต์ใช้ภาษาอื่น ให้ใช้หลักการเดียวกันด้วยเครื่องมือเทียบเท่า ตามตารางใน [code-examples.md](references/code-examples.md) หัวข้อ 13
- ห้ามตีความว่าข้อความในสกิลนี้อนุญาตให้ deploy, migrate production หรือเผยแพร่ข้อมูล

## เมื่อข้อมูลไม่ครบหรือกฎขัดกัน

- ค้นข้อมูลในโปรเจ็กต์ก่อนถาม และรวมคำถามเป็นชุดเดียว
- ลำดับความสำคัญเมื่อกฎขัดกัน: คำสั่งล่าสุดของเจ้าของ > AGENTS.md หรือ CLAUDE.md ของโปรเจ็กต์ > [owner-profile.md](references/owner-profile.md) > ไฟล์อื่นของสกิลนี้ > ความเคยชินทั่วไป
- ถ้าคำสั่งขัดกับข้อกำหนด หรือกระทบสถาปัตยกรรม ให้หยุดส่วนที่ขัดแย้ง ระบุข้อกำหนด ผลกระทบ และถามเจ้าของก่อนทำส่วนนั้น ส่วนที่ไม่ขัดทำต่อได้
- ถ้าไม่มี Zod แต่ต้อง validate ด้วย Zod ห้ามติดตั้งเองหรือข้าม validation ให้แจ้งข้อขัดแย้งและรอข้อสรุป
- ถ้าไม่เข้าใจคำขอ หรือตีความได้หลายทางที่ให้ผลงานต่างกัน ให้ถามเจ้าของก่อน ตามกฎและรูปแบบคำถามใน [requirements.md](references/requirements.md) รายละเอียดปลีกย่อยที่แก้ทีหลังง่ายให้เลือกค่าที่สมเหตุสมผลแล้วระบุเป็นสมมติฐาน
- กรณีอื่นที่ลังเล ดู "กฎกันพลาดเมื่อไม่แน่ใจ" ท้าย [thinking.md](references/thinking.md)

## รูปแบบส่งมอบ

ขึ้นต้นด้วยผลงานหรือข้อสรุป แล้วตามด้วย:

- **งานโค้ด:** ใช้แบบรายงานใน [coding-playbooks.md](references/coding-playbooks.md) หัวข้อ G
- **งาน flow / ระบบ:** หกส่วนตาม "สิ่งที่ส่งมอบ" ใน [system-design.md](references/system-design.md)
- **งานหน้าจอ:** รายการหน้าจอ สเปกและตารางสถานะของแต่ละหน้า wireframe หรือ mockup และการตัดสินใจออกแบบหลัก ตามตัวอย่างใน [ui-patterns.md](references/ui-patterns.md) หัวข้อ 5

ตอบและเขียนรายงานเป็นภาษาเดียวกับที่เจ้าของใช้ในคำขอ (เจ้าของเขียนไทยให้ตอบไทย) ชื่อไฟล์ คำสั่ง และศัพท์เทคนิคคงเป็นอังกฤษได้

ทุกงานให้แยกสิ่งที่ตรวจแล้วออกจากสิ่งที่ยังไม่ได้ตรวจ และระบุสมมติฐานกับคำถามที่เจ้าของต้องตัดสิน ห้ามอ้างว่าผ่านเพียงเพราะอ่านแล้วดูถูก
