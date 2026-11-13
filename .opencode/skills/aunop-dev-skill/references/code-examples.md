# ตัวอย่างโค้ดตามมาตรฐาน

ตัวอย่างถูก/ผิดของกฎใน [coding-standards.md](coding-standards.md) เขียนด้วย TypeScript และ Zod ใช้เป็นแบบให้ทำตามรูปแบบ ไม่ใช่ให้คัดลอกชื่อไฟล์หรือชื่อตัวแปร ก่อนใช้ให้ตรวจเวอร์ชัน Zod, ตัว logger และตัวเชื่อมฐานข้อมูลที่โปรเจ็กต์มีอยู่จริง แล้วปรับให้ตรง

แต่ละตัวอย่างตัดมาเฉพาะส่วนที่แสดงกฎข้อนั้น ชื่อที่ไม่ได้ประกาศในตัวอย่าง (เช่น `NewOrderRow`, `PublicOrderSchema`, `OrderService`, `placeOrder`, `findByIdempotencyKey`) คือส่วนที่ละไว้เพื่อความสั้น โค้ดที่ส่งจริงต้องประกาศครบและ typecheck ผ่าน

## สารบัญ

1. Constant และ config (กฎข้อ 7)
2. Schema first (ข้อ 3)
3. Validate ที่ขอบเขต (ข้อ 4)
4. Error กลาง (ข้อ 8)
5. Repository (ข้อ 5, 11, 14)
6. Pure business logic (ข้อ 6, 9)
7. Service และ idempotency (ข้อ 10)
8. Handler (ขอบเขต layer)
9. Async และ N+1 (ข้อ 12, 14)
10. Pagination (ข้อ 14)
11. ข้อมูลที่ส่งออก (ข้อ 11)
12. Unit test (ข้อ 9)
13. เทียบหลักการในภาษาอื่น

## 1. Constant และ config

```ts
// order.constants.ts
export const TABLE = {
  USER: "user_tb",
  ORDER: "order_tb",
} as const;

export const ORDER_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export const ORDER_STATUS_VALUES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.PAID,
  ORDER_STATUS.CANCELLED,
] as const;

export const ORDER_CANCEL_WINDOW_MINUTES = 30;
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
```

`as const` ไม่ใช่ unsafe cast ใช้ได้ เพราะทำให้ type แคบลงตามค่าจริง ไม่ได้บังคับให้ค่าเป็น type อื่น

ผิด: เขียนค่าฝังกระจาย

```ts
if (order.status === "PAID" && minutes < 30) { /* ... */ }
```

## 2. Schema first

```ts
// order.schema.ts
import { z } from "zod";
import { ORDER_STATUS_VALUES } from "./order.constants";

export const OrderSchema = z.object({
  order_id: z.string().uuid(),
  order_user_id: z.string().uuid(),
  order_status: z.enum(ORDER_STATUS_VALUES),
  order_total_satang: z.number().int().nonnegative(),
  order_idempotency_key: z.string().min(1),
  order_create_date: z.coerce.date(),
});

export type Order = z.infer<typeof OrderSchema>;

export const CreateOrderInputSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;
```

ผิด: เขียน type ซ้ำด้วยมือ สองที่นี้จะไม่ตรงกันในวันหนึ่ง

```ts
interface Order { order_id: string; order_status: string }
```

เก็บเงินเป็นจำนวนเต็มหน่วยย่อย (สตางค์) เพราะเลขทศนิยมบวกกันแล้วคลาดเคลื่อน

## 3. Validate ที่ขอบเขต

```ts
export function parseCreateOrderInput(body: unknown): CreateOrderInput {
  const result = CreateOrderInputSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("ข้อมูลคำสั่งซื้อไม่ถูกต้อง", result.error.issues);
  }
  return result.data;
}
```

ผิด: บอก compiler ว่าเป็น type นั้นโดยไม่ได้ตรวจตอนรัน

```ts
const input = req.body as CreateOrderInput;
```

ข้อมูลทุกอย่างที่มาจากนอกโปรเซส (request, ผลจากฐานข้อมูล, ไฟล์ JSON, ข้อความ WebSocket, ตัวแปร environment, response จาก API อื่น) ให้รับเป็น `unknown` แล้วผ่าน schema ก่อนใช้

## 4. Error กลาง

```ts
// shared/errors/app-error.ts
export const ERROR_CODE = {
  VALIDATION: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export const HTTP_STATUS = {
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
} as const;

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly httpStatus: number,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: unknown) {
    super(ERROR_CODE.VALIDATION, message, HTTP_STATUS.BAD_REQUEST, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(ERROR_CODE.NOT_FOUND, message, HTTP_STATUS.NOT_FOUND);
  }
}
```

ตัวจัดการกลาง แปลง error ทุกชนิดเป็น response ที่ปลอดภัย:

```ts
interface ErrorBody {
  code: ErrorCode;
  message: string;
  trace_id: string;
  details?: unknown;
}

export function toErrorResponse(
  error: unknown,
  traceId: string,
): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      body: {
        code: error.code,
        message: error.message,
        trace_id: traceId,
        details: error.details,
      },
    };
  }
  // error ที่ไม่รู้จัก: log รายละเอียดไว้ภายใน ส่งข้อความกลาง ๆ ออกไป
  logger.error({ traceId, error }, "unhandled error");
  return {
    status: HTTP_STATUS.INTERNAL,
    body: {
      code: ERROR_CODE.INTERNAL,
      message: "เกิดข้อผิดพลาดภายในระบบ",
      trace_id: traceId,
    },
  };
}
```

`logger` คือตัวที่โปรเจ็กต์มีอยู่ ถ้าไม่มีให้ถามเจ้าของ ไม่ติดตั้งเอง

ผิด: กลืน error และ catch เพื่อโยนซ้ำเฉย ๆ

```ts
try { await save(order); } catch { /* เงียบ */ }
try { await save(order); } catch (e) { throw e; }
```

ใส่ try/catch เฉพาะจุดที่ทำอย่างใดอย่างหนึ่งได้: กู้คืน, เพิ่มบริบทแล้วโยนเป็น `AppError` พร้อม `cause`, หรือเป็นขอบเขตบนสุดที่เรียกตัวจัดการกลาง

## 5. Repository

```ts
// order.repository.ts
interface SqlClient {
  query(sql: string, params: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

const ORDER_COLUMNS =
  "order_id, order_user_id, order_status, order_total_satang, order_idempotency_key, order_create_date";

export function createOrderRepository(db: SqlClient) {
  return {
    async findById(orderId: string): Promise<Order | null> {
      const result = await db.query(
        `SELECT ${ORDER_COLUMNS} FROM ${TABLE.ORDER} WHERE order_id = $1 LIMIT 1`,
        [orderId],
      );
      const row = result.rows[0];
      return row === undefined ? null : OrderSchema.parse(row);
    },
  };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
```

- ค่าที่มาจากผู้ใช้ส่งผ่าน parameter (`$1`) เสมอ ห้ามต่อ string ชื่อตารางและคอลัมน์ที่มาจาก constant ในโค้ดต่อ string ได้เพราะไม่ใช่ input
- เลือกคอลัมน์ที่ใช้ ไม่ใช้ `SELECT *`
- ผลจากฐานข้อมูลผ่าน `OrderSchema.parse` ก่อนคืนค่า
- `SqlClient` ด้านบนเป็นตัวอย่างรูปร่าง ให้ใช้ type ของ driver หรือ ORM ที่โปรเจ็กต์มี

ผิด: SQL injection

```ts
await db.query(`SELECT * FROM order_tb WHERE order_id = '${orderId}'`, []);
```

## 6. Pure business logic

```ts
// order.rules.ts
const MS_PER_MINUTE = 60_000;

export function canCancelOrder(order: Order, now: Date): boolean {
  if (order.order_status !== ORDER_STATUS.PENDING) {
    return false;
  }
  const ageMinutes =
    (now.getTime() - order.order_create_date.getTime()) / MS_PER_MINUTE;
  return ageMinutes <= ORDER_CANCEL_WINDOW_MINUTES;
}
```

รับเวลาปัจจุบันเป็นพารามิเตอร์ ไม่เรียก `new Date()` ข้างใน ฟังก์ชันจึงให้ผลเดิมทุกครั้งและทดสอบได้โดยไม่ต้อง mock ฟังก์ชันกลุ่มนี้ไม่ import framework, driver หรือ repository

## 7. Service และ idempotency

Service ประสาน repository กับกฎธุรกิจ การป้องกันข้อมูลซ้ำต้องทำที่ฐานข้อมูลด้วย unique constraint เพราะการ "เช็กก่อนแล้วค่อย insert" กันคำขอสองตัวที่มาพร้อมกันไม่ได้

```ts
// ใน repository: order_idempotency_key มี UNIQUE constraint
async insertIfAbsent(input: NewOrderRow): Promise<Order | null> {
  const result = await db.query(
    `INSERT INTO ${TABLE.ORDER}
       (order_id, order_user_id, order_status, order_total_satang, order_idempotency_key)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_idempotency_key) DO NOTHING
     RETURNING ${ORDER_COLUMNS}`,
    [input.order_id, input.order_user_id, input.order_status,
     input.order_total_satang, input.order_idempotency_key],
  );
  const row = result.rows[0];
  return row === undefined ? null : OrderSchema.parse(row);
},
```

```ts
// order.service.ts
export function createOrderService(deps: { orders: OrderRepository }) {
  return {
    async createOrder(row: NewOrderRow): Promise<Order> {
      const created = await deps.orders.insertIfAbsent(row);
      if (created !== null) {
        return created;
      }
      // key นี้เคยถูกใช้แล้ว: คืนผลเดิม ไม่สร้างซ้ำ
      const existing = await deps.orders.findByIdempotencyKey(
        row.order_idempotency_key,
      );
      if (existing === null) {
        throw new AppError(
          ERROR_CODE.CONFLICT,
          "ไม่สามารถยืนยันคำสั่งซื้อได้ กรุณาลองใหม่",
          HTTP_STATUS.CONFLICT,
        );
      }
      return existing;
    },
  };
}
```

การแก้สถานะให้ใส่สถานะเดิมในเงื่อนไข เพื่อให้คำขอที่มาพร้อมกันสำเร็จได้เพียงตัวเดียว:

```sql
UPDATE order_tb SET order_status = $1
WHERE order_id = $2 AND order_status = $3
```

แล้วตรวจจำนวนแถวที่ถูกแก้ ถ้าเป็นศูนย์แปลว่าสถานะถูกเปลี่ยนไปแล้ว

## 8. Handler

หน้าที่มีห้าอย่างตามลำดับ และไม่มีอย่างอื่น: ตรวจตัวตนและสิทธิ์ → validate input → เรียก service → map response → ส่ง error ให้ตัวจัดการกลาง

```ts
export async function handleCreateOrder(
  request: { body: unknown; userId: string | null; idempotencyKey: string | null; traceId: string },
  service: OrderService,
): Promise<{ status: number; body: unknown }> {
  try {
    if (request.userId === null) {
      throw new AppError(ERROR_CODE.UNAUTHORIZED, "กรุณาเข้าสู่ระบบ", HTTP_STATUS.UNAUTHORIZED);
    }
    if (request.idempotencyKey === null) {
      throw new ValidationError("ต้องระบุ Idempotency-Key", null);
    }
    const input = parseCreateOrderInput(request.body);
    const order = await service.placeOrder(request.userId, request.idempotencyKey, input);
    return { status: HTTP_STATUS.CREATED, body: PublicOrderSchema.parse(order) };
  } catch (error) {
    return toErrorResponse(error, request.traceId);
  }
}
```

รูปร่างของ `request` ขึ้นกับ framework ของโปรเจ็กต์ ตัวอย่างนี้แสดงลำดับงาน ไม่ใช่ API ของ framework ใด

## 9. Async และ N+1

```ts
// ถูก: งานที่ไม่ขึ้นต่อกันรันพร้อมกัน และ await ทุกตัว
const [user, orders] = await Promise.all([
  users.findById(userId),
  orders.listByUser(userId, page),
]);
```

ผิด: promise ลอย ถ้าพังจะกลายเป็น unhandled rejection

```ts
sendEmail(user); // ไม่มี await ไม่มี catch
```

ถ้าตั้งใจไม่รอผล ให้มีผู้รับ error ชัดเจน:

```ts
void sendEmail(user).catch((error: unknown) => {
  logger.error({ traceId, error }, "send email failed");
});
```

ผิด: N+1 ยิง query หนึ่งครั้งต่อหนึ่งรายการ

```ts
for (const order of orders) {
  order.user = await users.findById(order.order_user_id);
}
```

ถูก: รวม id แล้วดึงครั้งเดียว

```ts
const userIds = [...new Set(orders.map((o) => o.order_user_id))];
const userList = await users.findByIds(userIds); // WHERE user_id = ANY($1)
const userById = new Map(userList.map((u) => [u.user_id, u]));
```

## 10. Pagination

```ts
export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  cursor: z.string().optional(),
});
```

ทุก endpoint ที่คืนรายการต้องมี limit ที่มีค่าสูงสุด เรียงด้วยคอลัมน์ที่มี index และไม่ซ้ำ (เช่น `order_create_date, order_id`) ข้อมูลที่โตเรื่อย ๆ ใช้ cursor แทน offset เพราะ offset ช้าลงตามหน้าและข้ามแถวเมื่อมีข้อมูลแทรก

## 11. ข้อมูลที่ส่งออก

กำหนด schema ของ response แยก และ parse ก่อนส่ง ฟิลด์ที่ไม่อยู่ใน schema จะถูกตัดออก จึงกัน password hash หรือ token หลุด

```ts
export const PublicUserSchema = UserSchema.pick({
  user_id: true,
  user_name: true,
});
```

ตรวจความเป็นเจ้าของทุกครั้งที่ดึงด้วย id การล็อกอินแล้วไม่ได้แปลว่ามีสิทธิ์เห็นข้อมูลของคนอื่น:

```ts
if (order.order_user_id !== currentUserId) {
  throw new NotFoundError("ไม่พบคำสั่งซื้อ"); // ไม่บอกว่ามีอยู่แต่ไม่มีสิทธิ์
}
```

## 12. Unit test

ใช้ test runner ที่โปรเจ็กต์มี ตัวอย่างใช้รูปแบบ `describe/it/expect`:

```ts
describe("canCancelOrder", () => {
  const base: Order = { /* สร้างข้อมูลครบตาม schema */ };
  const createdAt = new Date("2026-01-01T10:00:00Z");

  it("อนุญาตเมื่อสถานะ PENDING และยังไม่เกินเวลา", () => {
    const now = new Date("2026-01-01T10:29:00Z");
    expect(canCancelOrder({ ...base, order_create_date: createdAt }, now)).toBe(true);
  });

  it("ไม่อนุญาตเมื่อเกินเวลา", () => {
    const now = new Date("2026-01-01T10:31:00Z");
    expect(canCancelOrder({ ...base, order_create_date: createdAt }, now)).toBe(false);
  });

  it("ไม่อนุญาตเมื่อชำระแล้ว", () => {
    const paid = { ...base, order_status: ORDER_STATUS.PAID, order_create_date: createdAt };
    expect(canCancelOrder(paid, createdAt)).toBe(false);
  });
});
```

หนึ่ง test ตรวจหนึ่งพฤติกรรม ชื่อ test บอกเงื่อนไขและผลที่คาด ครอบคลุมกรณีปกติ ค่าขอบ (พอดี 30 นาที) และกรณีผิดพลาด

## 13. เทียบหลักการในภาษาอื่น

| หลักการ | TypeScript | Python | C++ / Arduino (ESP32) |
| --- | --- | --- | --- |
| Type เข้มงวด | `strict`, ไม่ใช้ `any` | type hint + ตัวตรวจ type ที่โปรเจ็กต์ใช้ | เปิด warning, ใช้ `enum class`, หลีกเลี่ยง `void*` |
| Schema และ validate ที่ขอบเขต | Zod | pydantic หรือ dataclass + ฟังก์ชันตรวจ | `struct` + ฟังก์ชัน `parse...` ที่คืนสถานะสำเร็จ/ล้มเหลว ตรวจความยาวและช่วงค่าทุกครั้งที่อ่านจาก serial, HTTP, MQTT |
| ไม่ hardcode | constant / config | โมดูล constants / settings | `constexpr`, ไฟล์ `config.h` สำหรับ pin, timeout, URL; ความลับแยกไฟล์ที่ไม่ commit |
| แยก logic จาก I/O | service กับ repository | ฟังก์ชัน pure กับ repository | ฟังก์ชันตัดสินใจที่ไม่แตะ hardware แยกจากโค้ดอ่านเซนเซอร์และส่งเครือข่าย |
| Error มีผู้รับผิดชอบ | `AppError` + ตัวจัดการกลาง | exception class + handler กลาง | ค่าคืนสถานะที่ต้องตรวจทุกครั้ง, retry แบบมีขีดจำกัด, watchdog |
| ไม่บล็อกและไม่ชนกัน | await ทุก promise | `async`/`await` | ไม่ใช้ `delay()` ยาวใน loop หลัก ใช้ `millis()` หรือ task และป้องกันตัวแปรที่ใช้ร่วมกับ interrupt |
| ส่งซ้ำได้ปลอดภัย | idempotency key + unique constraint | เหมือนกัน | แนบ id ของเหตุการณ์ไปกับข้อมูล ให้ server ตัดรายการซ้ำเมื่ออุปกรณ์ส่งใหม่หลังเน็ตหลุด |
