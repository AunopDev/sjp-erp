# วิธีคิด flow โปรเจ็กต์

ใช้ระดับรายละเอียดตามขนาดงาน งานแก้เล็กใช้หัวข้อเหล่านี้เป็น checklist ไม่ต้องสร้างเอกสารทุกชิ้น

## 1. เป้าหมายและขอบเขต

เขียนปัญหา ผู้ใช้งาน ผลลัพธ์ที่ต้องการ สิ่งที่อยู่ในขอบเขต/นอกขอบเขต และ acceptance criteria ที่ตรวจได้ แยกข้อเท็จจริง สมมติฐาน และคำถามที่ยังต้องตัดสินใจ

## 2. สำรวจระบบเดิม

ตรวจ entry point, dependency, schema, repository, error handler, auth, telemetry และคำสั่งตรวจงานที่มีอยู่ ระบุส่วนที่จะ reuse และผลกระทบต่อผู้ใช้เดิม ห้ามเลือก stack ใหม่โดยยังไม่ตรวจของเดิม

## 3. ออกแบบ flow

บันทึกเส้นทางหลัก เส้นทางข้อมูลผิด ไม่มีสิทธิ์ ไม่พบข้อมูล ระบบภายนอกล้มเหลว การส่งซ้ำ และการทำงานพร้อมกัน

```text
Input → Authentication/Authorization → Zod validation
      → Use case → Repository → Database
      → Validate database result → Safe response
Failure → Central error handler → Safe error response + trace ID
```

ลำดับ auth และ validation ปรับตาม endpoint โดยต้องตรวจสิทธิ์ก่อนเข้าถึงหรือเปลี่ยนข้อมูลที่ถูกป้องกัน

## 4. ออกแบบข้อมูลและ contract

- Zod schema: request, response, database result และ event ที่เกี่ยวข้อง
- Table/column ตาม naming convention พร้อม key, relation, constraint และ index
- API: input/output, error, auth, pagination, idempotency และ compatibility
- Transaction: สิ่งใดต้องสำเร็จหรือ rollback ร่วมกัน รวมถึงผลข้างเคียงภายนอกที่ transaction ฐานข้อมูลย้อนกลับไม่ได้

## 5. แบ่งงานก่อนเขียน

ระบุไฟล์หรือส่วนที่แก้ ลำดับ dependency วิธีทดสอบ และความเสี่ยง ใช้ schema → repository → business logic → handler เป็นแนวคิด ไม่บังคับลำดับไฟล์หากระบบเดิมมีข้อจำกัด

## 6. ตรวจและส่งมอบ

ตรวจ acceptance criteria, typecheck, lint และการทดสอบที่เกี่ยวข้อง อัปเดต API spec เมื่อ contract เปลี่ยน ระบุผลจริงและสิ่งที่ยังตรวจไม่ได้

## แบบบันทึกสำหรับคัดลอกไปเติม

| หัวข้อ             | สิ่งที่ต้องบันทึก                                  |
| ------------------ | -------------------------------------------------- |
| เป้าหมาย           | ใครมีปัญหาอะไร และผลสำเร็จคืออะไร                  |
| ขอบเขต             | ทำอะไรและไม่ทำอะไรในงานนี้                         |
| Flow หลัก          | trigger, input, decision, action, output           |
| Flow ผิดพลาด       | validation, auth, not found, dependency failure    |
| ข้อมูล             | schema, table, constraint, index, sensitive fields |
| การส่งซ้ำ/พร้อมกัน | idempotency และ concurrency control                |
| ผลกระทบเดิม        | API consumer, migration, rollout/rollback          |
| เกณฑ์สำเร็จ        | ตัวอย่างที่สังเกตและทดสอบได้                       |
| แผนตรวจ            | คำสั่งและ scenario ที่จะใช้                        |
| คำถามค้าง          | สิ่งที่เจ้าของต้องตัดสินใจก่อนลงมือ                |
