import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { isValidScanToken } from "./verify-password";

// const SCAN_MODEL = "claude-haiku-4-5-20251001"; // cheaper, less accurate
const SCAN_MODEL = "claude-sonnet-4-6";

const MAX_BYTES_BEFORE_RESIZE = 5 * 1024 * 1024; // 5 MB
const MAX_BYTES_AFTER_RESIZE = 2 * 1024 * 1024; // 2 MB
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// In-memory rate limit store: ip → { count, resetAt }
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

const EXTRACT_PROMPT = `You are reading a Thai logistics runsheet (SPX or Flash Express) used for fuel reimbursement claims.

Step 1 — Identify the carrier by logo and title:
- "spx" → has "SPX" red logo and header "Linehaul Trip Runsheet"
- "flash" → has "FLASH EXPRESS" logo and header "Proof of Van Dispatching"

Step 2 — Extract fields by their visual region.

For SPX (Linehaul Trip Runsheet):
- TOP-LEFT region (above the main info block): a small barcode image with "ID:<number>" printed below it — IGNORE this ID number, it is NOT the barcode field. The "ชื่อคนขับ" row (right above the dashed line) contains a long string like "LH LH-IFN 683943 Semi trailer พงศธร สุขเดช - SUB". Extract ONLY the Thai personal name (e.g. "พงศธร สุขเดช") → name field — strip out the agency code prefix ("LH LH-IFN <digits> Semi trailer" or similar) and any trailing suffix after a dash (e.g. "- SUB", "- MAIN"). The driver name is always the Thai-script portion between those wrappers.
- LEFT INFO BLOCK (under the dashed line) has labeled rows:
  · "ชื่อทริป :" → trip code, ignore
  · "เลขทริป :" → trip number (e.g. "LT0Q5725QQK92") → barcode field
  · "เวลา Seal รถ :" → ignore
  · "STA:" → arrival, ignore
  · "STD:" → standby datetime, format "YYYY/MM/DD HH:MM:SS" → standby_round
  · "Operator:" → ignore
  · "ชื่อ Agency:" → supplier_name (e.g. "LH-IFN")
  · "ประเภทรถ:" → vehicle_type (the row right below "ชื่อ Agency:"). Take ONLY the part before any dash — e.g. "Semi trailer-รถห้องแม่ลูก" → "Semi trailer"
  · "ทะเบียนรถ:" → car_no (keep dash, e.g. "68-3943")
  · "LH trip route :" → route, formatted "<A> > <B>" (e.g. "SOCN > SORC-B")
- date is derived from the STD date portion.
- phone: not present in SPX, leave "".

For Flash Express (Proof of Van Dispatching):
- TOP-LEFT region: car number with city in parens (e.g. "684144(กรุงเทพ)") sits ABOVE a barcode image; the alphanumeric barcode VALUE (e.g. "KKC1PR6U72") is printed BELOW the barcode image. To the RIGHT of the barcode image sits the "Date" label with value like "2026-05-07".
  · car_no → digits only from the "Car no" text (drop the city in parens, e.g. "684144")
  · barcode → the alphanumeric code printed under the barcode image (NOT the digits in "Car no")
  · date → from the "Date" field, convert to DD/MM/YYYY
- TOP-MIDDLE labeled rows (label on left, value on right):
  · "พนักงานขับรถ 1" → "<name> (<phone>)" → split: name without parens → name; the digits inside parens → phone
  · "พนักงานขับรถ 2" → ignore
  · "ชื่อบริษัท" → supplier_name (e.g. "IFNM")
  · "ต้นทาง" → IGNORE (this is a short station code, NOT the route)
  · "ชื่อเส้นทาง" → route (a long dash-separated string like "DD1-6W7.2-NE2-NO2-NO4-20260507 840") — THIS is the route field, not "ต้นทาง". The SECOND dash-separated segment of this string is the vehicle type → vehicle_type (e.g. from "DD1-6W7.2-NE2-NO2-NO4-20260507" extract "6W7.2")
  · "ผู้ดำเนินงาน" → ignore
  · "Print time" → ignore
- MIDDLE TABLE columns (left to right, 1-indexed): col1=ลำดับ | col2=ชื่อสาขา | col3=วันที่ | col4=เวลาคาดว่าจะถึง | col5=เวลาที่ถึงจริง | col6=เวลาคาดว่าจะออกเดินทาง | col7=เวลาที่ออกเดินทางจริง | col8=ระยะเวลา | col9=ระยะทาง | col10=เลขซีลล็อครถ | col11=สาขาเซ็นรับรอง
  · From the FIRST DATA ROW (the row right below the header row) take col3 "วันที่" as the date and col4 "เวลาคาดว่าจะถึง" (expected arrival time, printed/typed) as the standby time. Combine into standby_round as "DD/MM/YYYY HH:MM". Example: row 1 has date "2026-05-07" and col4 "10:00" → standby_round = "07/05/2026 10:00".

Return ONLY this JSON object, no markdown, no explanation:
{
  "carrier": "spx" or "flash",
  "supplier_name": "SPX: ชื่อ Agency value (e.g. LH-IFN) | Flash: ชื่อบริษัท value (e.g. IFNM)",
  "date": "DD/MM/YYYY (convert พ.ศ. to ค.ศ. if needed)",
  "name": "driver full name (no phone, no parentheses)",
  "car_no": "see carrier rules above",
  "phone": "digits only (Flash only; empty for SPX)",
  "barcode": "see carrier rules above",
  "route": "see carrier rules above (Flash: ชื่อเส้นทาง, NOT ต้นทาง)",
  "vehicle_type": "SPX: ประเภทรถ value | Flash: 2nd dash-segment of ชื่อเส้นทาง (e.g. 6W7.2)",
  "standby_round": "DD/MM/YYYY HH:MM in 24h format"
}
If any field is not found, return "" for that field. Return JSON only.`;

type ScanResult = {
  carrier: string;
  supplier_name: string;
  date: string;
  name: string;
  car_no: string;
  phone: string;
  barcode: string;
  route: string;
  vehicle_type: string;
  standby_round: string;
};

const SCAN_KEYS: (keyof ScanResult)[] = [
  "carrier",
  "supplier_name",
  "date",
  "name",
  "car_no",
  "phone",
  "barcode",
  "route",
  "vehicle_type",
  "standby_round",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth
  const token = req.headers["x-scan-token"] as string | undefined;
  if (!token || !isValidScanToken(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Rate limit
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    "unknown";
  const { allowed, retryAfterMs } = checkRateLimit(ip);
  if (!allowed) {
    const retryMins = Math.ceil(retryAfterMs / 60000);
    return res
      .status(429)
      .json({ error: `สแกนเกินจำนวน รอ ${retryMins} นาที`, retryAfterMs });
  }

  const { image, barcode: qrBarcode } = req.body as {
    image?: string; // base64 jpeg
    barcode?: string; // QR value decoded client-side (full-res)
  };
  if (!image) {
    return res.status(400).json({ error: "ไม่พบรูปภาพ" });
  }

  // Size check after resize (client sends resized image)
  const byteLength = Buffer.byteLength(image, "base64");
  if (byteLength > MAX_BYTES_BEFORE_RESIZE) {
    return res.status(413).json({ error: "รูปใหญ่เกินไป (สูงสุด 5MB)" });
  }
  if (byteLength > MAX_BYTES_AFTER_RESIZE) {
    return res.status(413).json({ error: "รูปยังใหญ่เกิน ลองถ่ายใหม่" });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: SCAN_MODEL,
      max_tokens: 1024,
      tools: [
        {
          name: "extract_fields",
          description: "Return the extracted runsheet fields.",
          input_schema: {
            type: "object",
            properties: Object.fromEntries(
              SCAN_KEYS.map((k) => [k, { type: "string" }]),
            ),
            required: SCAN_KEYS as string[],
          },
        },
      ],
      tool_choice: { type: "tool", name: "extract_fields" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACT_PROMPT },
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: image },
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      console.error("[scan] no tool_use in response", response.stop_reason);
      return res.status(422).json({ error: "อ่านรูปไม่สำเร็จ" });
    }

    const parsed = toolUse.input as Record<string, unknown>;
    const result: ScanResult = {} as ScanResult;
    SCAN_KEYS.forEach((k) => {
      result[k] = parsed[k] != null ? String(parsed[k]) : "";
    });

    // Prefer the QR code (decoded client-side at full res) for the barcode; fall
    // back to the model's reading (เลขทริป / printed code) when QR isn't detected.
    if (qrBarcode) result.barcode = qrBarcode;

    return res.status(200).json(result);
  } catch (err) {
    console.error("[scan] failed:", err);
    return res.status(500).json({ error: "อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง" });
  }
}
