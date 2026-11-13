# มาตรฐานการเขียนโค้ด

เอกสารนี้เรียบเรียงจากข้อกำหนดของเจ้าของ เก็บข้อบังคับไว้ครบ ส่วนคำอธิบายการนำไปใช้และตัวอย่างเป็นต้นแบบที่เจ้าของแก้ได้

## ข้อกำหนดหลัก 16 ข้อ

1. **Keep it simple:** ใช้โค้ดเรียบง่ายตามความจำเป็นปัจจุบัน ห้ามสร้าง class, wrapper หรือ generic ซับซ้อนเพื่อรองรับอนาคตที่ยังไม่ต้องใช้
2. **Strict type safety:** ใช้ TypeScript แบบเข้มงวด ห้าม `any`, `as any` และ unsafe cast เช่น `as unknown` กำหนด type ที่ชัดเจน โดยใช้ inference ที่ปลอดภัยได้
3. **Schema first / SSOT:** ออกแบบข้อมูลด้วย Zod ก่อน แล้วใช้ `z.infer<typeof Schema>` ห้ามเขียน type ของข้อมูลเดียวกันซ้ำด้วยมือ
4. **Validate at boundary:** ตรวจ API request, database result, JSON และ WebSocket ด้วย Zod ก่อนเข้าสู่ logic ภายใน ห้ามเชื่อ type annotation ว่าเป็นการตรวจ runtime
5. **Separate data layer:** แยก data access เป็น repository ออกจาก business logic การแยกนี้เป็นมาตรฐานพื้นฐาน ไม่ถือว่า over-engineering
6. **Pure business logic:** ใช้ pure function หรือ class ที่ไม่ผูก framework และ database driver เพื่อทดสอบและใช้ซ้ำได้
7. **No hardcode:** รวม URL, status, role, table name และ magic number ใน constant, enum หรือ config ห้ามฝังค่าเหล่านี้กระจัดกระจาย
8. **Centralized errors:** จัดการ error ด้วย try/catch อย่างรัดกุม ส่งต่อระบบกลาง และ log สาเหตุให้ debug ได้ ห้ามกลืน error หรือปล่อย exception หลุดโดยไม่มีผู้รับผิดชอบ
9. **Testable design:** ออกแบบ business logic และ data layer ให้รองรับ unit/integration test ตรวจพฤติกรรมสำคัญและกรณีผิดพลาด
10. **Idempotency / safe retries:** งานสร้างหรือแก้ข้อมูลต้องออกแบบให้ส่งซ้ำได้อย่างปลอดภัย ป้องกันข้อมูลหรือผลข้างเคียงซ้ำ
11. **Security:** sanitize input ตามบริบท ใช้ parameterized query ตรวจสิทธิ์ และห้ามส่ง password hash หรือ internal token ใน response; Zod validation ไม่ทดแทน SQL parameterization หรือ output escaping
12. **Async / concurrency:** รับผิดชอบ promise ทุกตัว ป้องกัน unhandled rejection และออกแบบกลไกป้องกัน race condition
13. **Observability:** รองรับ metrics และ trace ID เดียวกันตลอด request ห้าม log secret หรือข้อมูลอ่อนไหว
14. **Database performance:** หลีกเลี่ยง N+1, memory leak และการดึงข้อมูลจำนวนมากโดยไม่มี pagination ออกแบบ query ให้ใช้ index ได้
15. **Self-documenting / API spec:** ใช้ชื่อที่สื่อความหมาย คอมเมนต์อธิบายเหตุผลของ logic ซับซ้อน และปรับ OpenAPI/Swagger เมื่อเปลี่ยน contract
16. **Backward compatibility:** หลีกเลี่ยง breaking change ตรวจผู้ใช้งานเดิมและ migration ที่เกี่ยวข้อง พิจารณา feature flag สำหรับการเปิดฟีเจอร์ใหม่อย่างปลอดภัย

## การตั้งชื่อฐานข้อมูล

- Table: ชื่อข้อมูลตามด้วย `_tb` เช่น `user_tb`, `order_tb`
- Column/field: ชื่อสิ่งที่เป็นเจ้าของตามด้วยข้อมูลที่เก็บ เช่น `user_name`, `user_email`, `order_status`
- Primary key: `<ชื่อข้อมูล>_id` เช่น `user_id`, `order_id`
- วันที่สร้างและแก้ไข: ทุกตารางมี `<ชื่อข้อมูล>_create_date` และ `<ชื่อข้อมูล>_update_date` เช่น `user_create_date`, `user_update_date` ไม่ใช้ `created_at` / `updated_at`
- คอลัมน์ที่อ้างถึงตารางอื่น (foreign key): `<ชื่อข้อมูลของตารางนี้>_<ชื่อข้อมูลที่อ้างถึง>_id` เช่น `order_user_id` ในตาราง `order_tb` ชี้ไป `user_tb.user_id` (ข้อนี้เป็นค่าตั้งต้นที่ต่อยอดจากกฎข้างบน เจ้าของปรับได้)
- ใช้ตัวพิมพ์เล็กและขีดล่าง (snake_case) ชื่อข้อมูลเป็นเอกพจน์ ไม่ย่อจนเดาความหมายไม่ได้

| ตาราง | ตัวอย่างคอลัมน์ |
| --- | --- |
| `test_tb` | `test_id`, `test_name`, `test_create_date`, `test_update_date` |
| `order_tb` | `order_id`, `order_user_id`, `order_status`, `order_create_date`, `order_update_date` |

- คำว่า record ในข้อกำหนดต้นฉบับตีความในต้นแบบนี้ว่า column/field ไม่ใช่ชื่อแถวข้อมูล เจ้าของปรับความหมายได้
- ฐานข้อมูลเดิมที่ชื่อไม่ตรง: ห้าม rename ทั้งระบบเพื่อทำตามกฎโดยพลการ ต้องประเมิน compatibility และตกลงขอบเขตก่อน

## ขอบเขต layer

| ส่วน                 | หน้าที่                                                   | ข้อจำกัด                         |
| -------------------- | --------------------------------------------------------- | -------------------------------- |
| Schema               | รูปแบบข้อมูลและ runtime validation                        | เป็นแหล่งกำเนิด type ข้อมูล      |
| Controller / handler | รับ request, validate, auth, เรียก use case, map response | ไม่เขียน query หรือกฎธุรกิจ      |
| Business / use case  | กฎธุรกิจและการตัดสินใจ                                    | ไม่ import framework หรือ driver |
| Repository           | query, transaction, validate ผลฐานข้อมูล                  | ไม่กำหนด HTTP response           |
| Error / telemetry    | map error, log, metrics, trace                            | ไม่เปิดเผยข้อมูลลับ              |

โครงสร้างตัวอย่างสำหรับฟีเจอร์ user ใช้เมื่อเหมาะกับโปรเจ็กต์ใหม่:

```text
src/
  config/
  shared/
    errors/
    observability/
  features/
    user/
      user.schema.ts
      user.constants.ts
      user.repository.ts
      user.service.ts
      user.controller.ts
```

ไม่ต้องสร้างไฟล์ว่างหรือ abstraction ที่ยังไม่มีหน้าที่ สำหรับโปรเจ็กต์เดิมให้ใช้ convention เดิมเท่าที่ไม่ขัดข้อบังคับ

## กฎพฤติกรรม Agent

- โค้ดต้องทำงานครบ ห้ามทิ้ง placeholder เช่น `// TODO`, `// implement later` หรือ `// ... rest of code`
- ห้ามเพิ่มหรือแนะนำ npm package โดยไม่ได้รับอนุญาต ใช้เครื่องมือที่มีในโปรเจ็กต์
- แก้เฉพาะไฟล์ที่เกี่ยวข้อง ห้าม refactor ส่วนอื่นแถม
- เมื่อคำสั่งขัดกฎหรือส่งผลเสียต่อสถาปัตยกรรม ให้หยุดส่วนที่เกี่ยวข้องและถามเจ้าของพร้อมอธิบายเหตุผล

## แนวทางประยุกต์ที่เจ้าของควรทบทวน

ส่วนนี้อธิบายวิธีทำตามกฎ ไม่ใช่การยกเว้นข้อบังคับ:

- Error: วาง try/catch ตรง boundary หรือจุดที่กู้คืน/เพิ่มบริบทได้ แล้วให้ error ไหลสู่ตัวจัดการกลางที่มีผู้รับผิดชอบ แทนการ catch แล้วโยนซ้ำทุกฟังก์ชัน
- Idempotency: ใช้กลไกตามผลข้างเคียง เช่น unique constraint, transaction, conditional update หรือ idempotency key; การตรวจว่ามีข้อมูลแล้วก่อน insert อย่างเดียวไม่ป้องกันคำขอพร้อมกัน
- Pure logic: แยกการคำนวณ/ตัดสินใจออกจากขั้นตอนประสาน repository ซึ่งเป็นส่วนที่มีผลข้างเคียง
- Config: ระบุค่าธุรกิจและค่าปฏิบัติการที่ต้องรวมศูนย์ เจ้าของควรเติมขอบเขตของ literal ที่อนุญาตให้เขียนตรง
- Observability: ใช้โครงสร้างที่มีอยู่ หากยังไม่มีและต้องเพิ่ม dependency ให้ถามก่อน
