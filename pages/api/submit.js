import { google } from "googleapis";
import fetch from "node-fetch";
import { Readable } from "stream";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const BKK = "Asia/Bangkok";

async function findOrCreateFolder(drive, name, parentId) {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data.id;
}

async function uploadImage(drive, imageBase64, fileName, folderId) {
  const buffer = Buffer.from(imageBase64, "base64");
  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: "image/jpeg",
      parents: [folderId],
    },
    media: { mimeType: "image/jpeg", body: Readable.from(buffer) },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  return uploaded.data;
}

export default async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const data = req.body;
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

    const makeAuth = (scopes) =>
      new google.auth.GoogleAuth({
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key,
        },
        scopes,
        projectId: credentials.project_id,
      });

    // ── Drive image upload (best-effort) ──────────────────────────────────────
    let driveFileId = null;
    let driveWebViewLink = null;

    if (data.image && process.env.DRIVE_FOLDER_ID) {
      try {
        const driveAuth = makeAuth(["https://www.googleapis.com/auth/drive"]);
        const drive = google.drive({ version: "v3", auth: driveAuth });
        const now = dayjs().tz(BKK);
        const year = now.format("YYYY");
        const month = now.format("MMM");
        const day = now.format("DD");

        const yearFolderId = await findOrCreateFolder(
          drive,
          year,
          process.env.DRIVE_FOLDER_ID,
        );
        const monthFolderId = await findOrCreateFolder(
          drive,
          month,
          yearFolderId,
        );
        const dayFolderId = await findOrCreateFolder(drive, day, monthFolderId);

        const dateForFile = data.date.replace(/\//g, "-");
        const safeName = (data.name || "").replace(/[/\\?%*:|"<>]/g, "_");
        const fileName = `${dateForFile}_${safeName}_${data.barcode || "nobar"}.jpg`;

        const uploaded = await uploadImage(
          drive,
          data.image,
          fileName,
          dayFolderId,
        );
        driveFileId = uploaded.id;
        driveWebViewLink = uploaded.webViewLink;
      } catch (err) {
        console.error(
          "[submit] Drive upload failed (best-effort):",
          err.message,
          err.response?.data ?? "",
        );
      }
    }

    // ── Google Sheets ─────────────────────────────────────────────────────────
    const sheets = google.sheets({
      version: "v4",
      auth: makeAuth(["https://www.googleapis.com/auth/spreadsheets"]),
    });
    const sheetId = process.env.SHEET_ID;
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    console.log(
      "[debug] sheet tabs:",
      meta.data.sheets.map((s) => s.properties.title),
    );
    const imageCell = driveWebViewLink
      ? `=HYPERLINK("${driveWebViewLink}","ดูรูป")`
      : "";

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Form!A1",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            dayjs().tz(BKK).format("DD/MM/YYYY, HH:mm:ss"),
            data.date,
            data.name,
            data.car_no,
            data.phone,
            data.barcode,
            data.vehicle_type,
            data.route,
            data.standby_round,
            data.standby_time,
            data.depart_time,
            data.remark,
            data.trip_fee,
            data.oil_claim,
            data.bank,
            data.account_name,
            data.account_number,
            imageCell,
          ],
        ],
      },
    });

    // ── LINE notification ─────────────────────────────────────────────────────
    const token = process.env.LINE_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    const message = `
🚛 แจ้งเบิกน้ำมัน 🚛
วันที่: ${data.date}
ชื่อ🙋: ${data.name}
ทะเบียนรถ🚛: ${data.car_no}
เบอร์โทร: ${data.phone}
เลขบาร์: ${data.barcode}
ประเภทรถ🚚: ${data.vehicle_type}
เส้นทาง: ${data.route}
รอบเวลาสแตนบาย: ${data.standby_round}
เวลาสแตนบาย: ${data.standby_time}
ออกเดินทาง: ${data.depart_time}
หมายเหตุ: ${data.remark}
💸 ค่าเที่ยว: ${data.trip_fee}.00 บาท
💸 เบิกน้ำมัน: ${data.oil_claim} บาท
🏦 บัญชี: ${data.bank}
👤 ชื่อบัญชี: ${data.account_name}
🔢 เลขบัญชี: ${data.account_number}
`.trim();

    const lineMessages = [{ type: "text", text: message }];
    if (driveFileId) {
      // const proxyUrl = `https://${req.headers.host}/api/img/${driveFileId}`;
      console.log(
        "🚀 ~ proxyUrl:",
        `https://${req.headers.host}/api/img/${driveFileId}`,
      );

      const proxyUrl = `https://fda7-184-22-252-236.ngrok-free.app/api/img/${driveFileId}`;
      lineMessages.push({
        type: "image",
        originalContentUrl: proxyUrl,
        previewImageUrl: proxyUrl,
      });
    }

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to: groupId, messages: lineMessages }),
    });

    if (!lineRes.ok) {
      const errorText = await lineRes.text();
      return res.status(lineRes.status).send({
        error: `LINE API failed: ${lineRes.status} - ${errorText}`,
      });
    }

    res.status(200).send("ส่งข้อมูลเรียบร้อยแล้ว!");
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
};
