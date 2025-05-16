import { google } from 'googleapis';
import fetch from 'node-fetch';

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const data = req.body;

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const sheets = google.sheets({ version: 'v4', auth: new google.auth.JWT(
    credentials.client_email, null, credentials.private_key, ['https://www.googleapis.com/auth/spreadsheets']
  )});

  const sheetId = process.env.SHEET_ID;
  const range = 'ฟอร์ม!A2:Z';

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[
      new Date().toLocaleString('en-GB', { timeZone: 'UTC' }),
      data.date,
      data.name,
      data.car_no,
      data.phone,
      data.barcode,
      data.route,
      data.standby_round,
      data.standby_time,
      data.depart_time,
      data.remark,
      data.trip_fee,
      data.oil_claim,
      data.bank,
      data.account_name,
      data.account_number
    ]] }
  });

  const token = process.env.LINE_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;

  const message = `
🚛 แจ้งเบิกน้ำมัน 🚛
วันที่: ${data.date}
ชื่อ🙋: ${data.name}
ทะเบียนรถ🚛: ${data.car_no}
เบอร์โทร: ${data.phone}
เลขบาร์: ${data.barcode}
เส้นทาง: ${data.route}
รอบเวลาสแตนบาย: ${data.standby_round}
เวลาสแตนบาย: ${data.standby_time}
ออกเดินทาง: ${data.depart_time}
หมายเหตุ: ${data.remark}
💸 ค่าเที่ยว: ${data.trip_fee} บาท
💸 เบิกน้ำมัน: ${data.oil_claim} บาท
🏦 บัญชี: ${data.bank}
👤 ชื่อบัญชี: ${data.account_name}
🔢 เลขบัญชี: ${data.account_number}
`;

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ to: groupId, messages: [{ type: 'text', text: message }] })
  });

  res.status(200).send('ส่งข้อมูลเรียบร้อยแล้ว!');
};
