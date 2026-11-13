# จัดโครงสร้างไฟล์และโฟลเดอร์

ใช้เมื่อสร้างโปรเจ็กต์ใหม่ เพิ่มฟีเจอร์ หรือไม่แน่ใจว่าไฟล์ใหม่ควรอยู่ที่ไหน เจ้าของชอบโครงสร้างที่เป็นระเบียบแบบ Angular และ NestJS: จัดตามฟีเจอร์ ไฟล์หนึ่งทำหน้าที่เดียว และชื่อไฟล์บอกชนิด

โปรเจ็กต์ที่มีโครงสร้างอยู่แล้ว ให้วางไฟล์ใหม่ตามรูปแบบเดิม ห้ามย้ายหรือจัดโครงสร้างใหม่ทั้งโปรเจ็กต์โดยไม่ได้รับคำสั่ง ถ้าโครงเดิมขัดกับไฟล์นี้ ให้ทำตามโครงเดิมและแจ้งเจ้าของ

โปรเจ็กต์ใหม่ที่ใช้ Angular หรือ NestJS ให้สร้างด้วยเครื่องมือของ framework (CLI) ถ้าใช้ได้ เพราะได้โครงและการตั้งค่าที่ตรงกับเวอร์ชันที่ติดตั้ง ไม่เขียนไฟล์ตั้งค่าจากความจำ

## หลักที่ใช้กับทุก stack

1. **จัดตามฟีเจอร์ก่อน แล้วจึงตามชนิด:** ทุกอย่างของฟีเจอร์ `order` อยู่ในโฟลเดอร์ `order/` ไม่กระจายไปตามโฟลเดอร์ `controllers/`, `services/`, `models/` ระดับบนสุด เพราะงานส่วนใหญ่แก้ทีละฟีเจอร์ และลบฟีเจอร์ได้ด้วยการลบโฟลเดอร์เดียว
2. **ไฟล์หนึ่งทำหน้าที่เดียว** และชื่อบอกหน้าที่: `order.service.ts`, `order.repository.ts`
3. **ชื่อไฟล์และโฟลเดอร์ใช้ตัวพิมพ์เล็กคั่นด้วยขีด** (kebab-case) ตามด้วยจุดและชนิด: `leave-request.schema.ts`
4. **ของที่ใช้ร่วมอยู่ใน `shared/`** เฉพาะเมื่อมีผู้ใช้ตั้งแต่สองฟีเจอร์ขึ้นไป ของที่ใช้ฟีเจอร์เดียวอยู่ในฟีเจอร์นั้น
5. **ทิศทางการพึ่งพาไปทางเดียว:** ฟีเจอร์ใช้ `shared` และ `core` ได้ `shared` ไม่ใช้ฟีเจอร์ ฟีเจอร์หนึ่งไม่ import ไฟล์ภายในของอีกฟีเจอร์ ให้ใช้ผ่านสิ่งที่ฟีเจอร์นั้นเปิดออกมา
6. **test อยู่ข้างไฟล์ที่ทดสอบ:** `order.service.ts` คู่กับ `order.service.spec.ts` (หรือ `.test.ts` ตามที่โปรเจ็กต์ใช้)
7. **ไม่สร้างโฟลเดอร์หรือไฟล์ว่างเผื่อไว้** สร้างเมื่อมีของจะใส่
8. **โฟลเดอร์ลึกไม่เกินราว 4 ชั้นจาก `src`** ถ้าลึกกว่านั้นแปลว่าฟีเจอร์ควรแยก

## ชนิดไฟล์และหน้าที่

ตรงกับตาราง layer ใน [coding-standards.md](coding-standards.md)

| ลงท้าย | หน้าที่ | ห้ามมี |
| --- | --- | --- |
| `.constants.ts` | ค่าคงที่ สถานะ ชื่อตาราง ข้อความ | logic |
| `.schema.ts` | Zod schema และ type ที่ได้จาก schema | การเรียกฐานข้อมูล |
| `.repository.ts` | query และ transaction, validate ผลจากฐานข้อมูล | กฎธุรกิจ, รูปร่าง HTTP |
| `.rules.ts` | กฎธุรกิจแบบ pure function | I/O ทุกชนิด |
| `.service.ts` | ประสาน repository กับกฎธุรกิจ | query ตรง ๆ, รายละเอียด HTTP |
| `.controller.ts` / `.handler.ts` | รับ request, ตรวจสิทธิ์, validate, เรียก service, ส่ง response | กฎธุรกิจ, query |
| `.module.ts` | ประกาศและเชื่อมส่วนประกอบของฟีเจอร์ (NestJS) | logic |
| `.component.ts` | ส่วนแสดงผลและการโต้ตอบ (Angular) | การเรียก HTTP ตรง ๆ, กฎธุรกิจ |
| `.guard.ts`, `.interceptor.ts`, `.pipe.ts` | งานขวางทางตามชื่อของ framework | |
| `.spec.ts` / `.test.ts` | test | |

## Backend แบบ NestJS

```text
src/
  main.ts                       จุดเริ่ม: สร้างแอป ตั้งค่ากลาง
  app.module.ts                 รวมโมดูลฟีเจอร์
  config/
    app.config.ts               อ่านและ validate ตัวแปร environment ด้วย schema
  core/                         ของที่มีชุดเดียวทั้งแอป
    database/
      database.module.ts
      database.service.ts
    errors/
      app-error.ts
      error.filter.ts           ตัวจัดการ error กลาง
    logging/
    auth/
      auth.guard.ts
  shared/                       ของใช้ร่วมที่ไม่มีสถานะ
    schemas/                    schema ที่หลายฟีเจอร์ใช้ เช่น pagination
    utils/
  features/
    leave-request/
      leave-request.module.ts
      leave-request.controller.ts
      leave-request.service.ts
      leave-request.rules.ts
      leave-request.repository.ts
      leave-request.schema.ts
      leave-request.constants.ts
      leave-request.service.spec.ts
      leave-request.rules.spec.ts
    user/
      ...
test/                           test ข้ามฟีเจอร์ (end-to-end)
migrations/                     ตามเครื่องมือ migration ของโปรเจ็กต์
```

- หนึ่งฟีเจอร์หนึ่งโมดูล ฟีเจอร์อื่นใช้ได้เฉพาะสิ่งที่โมดูล export ซึ่งปกติคือ service
- controller บาง: รับค่า เรียก service คืนผล
- การ validate ใช้ Zod ตามมาตรฐานของเจ้าของ ถ้าโปรเจ็กต์เดิมใช้กลไกอื่นของ framework อยู่แล้ว ให้ทำตามของเดิมในส่วนที่แตะและแจ้งเจ้าของถึงความต่าง ไม่ผสมสองระบบในฟีเจอร์เดียว
- ตัวจัดการ error กลางอยู่ที่ `core/errors/` ที่เดียว

## Frontend แบบ Angular

```text
src/
  main.ts
  styles.css                    token และสไตล์กลาง
  app/
    app.config.ts
    app.routes.ts               เส้นทางระดับบน โหลดฟีเจอร์แบบ lazy
    core/                       ของที่มีชุดเดียว: โหลดครั้งเดียวตอนเริ่ม
      auth/
        auth.service.ts
        auth.guard.ts
        auth.interceptor.ts
      http/
        error.interceptor.ts
      layout/
        shell.component.ts      โครงหน้า: แถบนำทาง ส่วนหัว
    shared/                     ของใช้ซ้ำที่ไม่ผูกกับฟีเจอร์
      ui/                       ปุ่ม ช่องกรอก ตาราง modal
      pipes/
      schemas/
    features/
      leave-request/
        leave-request.routes.ts
        data/
          leave-request.api.ts        เรียก HTTP และ validate response ด้วย schema
          leave-request.schema.ts
          leave-request.store.ts      สถานะของฟีเจอร์ ถ้าจำเป็น
        pages/
          leave-request-list.page.ts
          leave-request-detail.page.ts
          leave-request-form.page.ts
        components/
          leave-status-badge.component.ts
        leave-request.constants.ts
  assets/
  environments/
```

- **page** คือ component ที่ผูกกับเส้นทาง ทำหน้าที่ดึงข้อมูลและประสาน **component** ย่อยรับข้อมูลเข้าและส่งเหตุการณ์ออก ไม่เรียก HTTP เอง
- การเรียก API อยู่ในไฟล์ `.api.ts` ของฟีเจอร์ที่เดียว และ validate ข้อมูลที่ได้ด้วย schema ก่อนส่งให้หน้าจอ
- ฟีเจอร์โหลดแบบ lazy ผ่านไฟล์ routes ของตัวเอง
- สไตล์ใช้ token จาก `styles.css` ตาม [ui-patterns.md](ui-patterns.md) ไม่ใส่ค่าสีหรือระยะลอยใน component
- แต่ละหน้ามีครบทุกสถานะตาม [ux-ui.md](ux-ui.md)
- ชื่อไฟล์และรูปแบบ component ทำตามที่ CLI ของเวอร์ชันที่ติดตั้งสร้างให้ ถ้าต่างจากตัวอย่างนี้ให้ยึดของ CLI

## ใช้ schema ร่วมกันระหว่าง frontend กับ backend

เมื่อทั้งสองฝั่งเป็น TypeScript ให้ schema ของ contract มีแหล่งเดียว เพื่อไม่ให้สองฝั่งเข้าใจข้อมูลไม่ตรงกัน

```text
apps/
  web/            Angular
  api/            NestJS
packages/
  contracts/      schema ของ request และ response ที่ทั้งสองฝั่ง import
    src/
      leave-request.contract.ts
```

ใช้โครงนี้เมื่อโปรเจ็กต์เป็น monorepo อยู่แล้วหรือเจ้าของเห็นชอบ ถ้าแยก repo ให้ถามเจ้าของว่าจะแบ่งปัน schema อย่างไร ไม่คัดลอกไฟล์ไปสองที่โดยไม่บอก

## Stack อื่น

ใช้หลักเดียวกัน เปลี่ยนเฉพาะชื่อตามธรรมเนียมของ stack นั้น

| Stack | โครง |
| --- | --- |
| React หรือ Vue | `src/features/<ชื่อ>/{api,components,pages,schema,constants}` + `src/shared` + `src/core` |
| Express หรือ framework เบา | `src/features/<ชื่อ>/<ชื่อ>.{schema,repository,service,handler,routes}.ts` + `src/shared` + `src/config` |
| Python | แพ็กเกจตามฟีเจอร์ แต่ละแพ็กเกจมี `schemas.py`, `repository.py`, `service.py`, `routes.py` |
| ESP32 | ดู [iot-esp32.md](iot-esp32.md) หัวข้อโครงสร้างโค้ด |

## ไฟล์ระดับบนสุดของโปรเจ็กต์

| ไฟล์ | เนื้อหา |
| --- | --- |
| `README.md` | โปรเจ็กต์คืออะไร วิธีติดตั้ง วิธีรัน คำสั่งตรวจ |
| `AGENTS.md` | กฎเฉพาะโปรเจ็กต์สำหรับเอเจนต์ และ path ของสกิลนี้ |
| `.env.example` | ชื่อตัวแปร environment ทั้งหมด ไม่มีค่าจริง |
| `.gitignore` | รวม `.env`, โฟลเดอร์ build, dependency |
| ไฟล์ตั้งค่าของเครื่องมือ | ตามที่ CLI สร้าง แก้เท่าที่จำเป็น |

## ตัดสินว่าไฟล์ใหม่อยู่ที่ไหน

ไล่ตามลำดับ ใช้ข้อแรกที่ตรง:

1. โปรเจ็กต์มีไฟล์ชนิดเดียวกันอยู่แล้ว → วางแบบเดียวกัน
2. ใช้โดยฟีเจอร์เดียว → ในโฟลเดอร์ของฟีเจอร์นั้น
3. ใช้โดยหลายฟีเจอร์ และไม่มีสถานะ → `shared/`
4. มีชุดเดียวทั้งแอป (auth, ฐานข้อมูล, logging, layout) → `core/`
5. เป็นการตั้งค่าจาก environment → `config/`
6. ยังไม่แน่ใจ → ไว้ในฟีเจอร์ที่ใช้ก่อน ย้ายไป `shared/` เมื่อมีผู้ใช้รายที่สอง

## ตรวจก่อนส่ง

- [ ] ไฟล์ใหม่ทุกไฟล์อยู่ตามรูปแบบเดิมของโปรเจ็กต์หรือตามกฎข้างบน
- [ ] ชื่อไฟล์เป็น kebab-case และลงท้ายด้วยชนิด
- [ ] ไม่มีฟีเจอร์ที่ import ไฟล์ภายในของอีกฟีเจอร์
- [ ] `shared/` ไม่ import จากฟีเจอร์
- [ ] ไม่มีไฟล์ว่าง ไฟล์ที่ไม่ได้ใช้ หรือโฟลเดอร์ที่สร้างเผื่อ
- [ ] ไม่ได้ย้ายหรือเปลี่ยนชื่อไฟล์เดิมนอกขอบเขตงาน
- [ ] รายงานระบุไฟล์ที่สร้างใหม่พร้อมเหตุผลของตำแหน่ง เมื่อไม่ชัดจากรูปแบบเดิม
