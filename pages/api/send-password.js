import { google } from 'googleapis';

export default async function handler(req, res) {
    const genratrApiUrl = "https://api.genratr.com/?length=6&lowercase&numbers";
    const genResponse = await fetch(genratrApiUrl);
    const jsonString = await genResponse.text(); 
    const obj = JSON.parse(jsonString);
    const password = obj.password;
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-GB');
    const message = `รหัสประจำวันนี้ ${formattedDate} : ${password}`;
    
    // save daily password in gg sheet
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const sheets = google.sheets({ version: 'v4', auth: new google.auth.JWT(
      credentials.client_email, null, credentials.private_key, ['https://www.googleapis.com/auth/spreadsheets']
    )});
    const sheetId = process.env.SHEET_ID;
    const range = 'Password!A1';

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[password]],
      },
    });

    // send to line
    const token = process.env.LINE_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;
    const pushUrl = "https://api.line.me/v2/bot/message/push";
  
    const payload = {
      to: groupId,
      messages: [
        {
          type: "text",
          text: message
        }
      ]
    };
  
    const response = await fetch(pushUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
  
    if (response.ok) {
      res.status(200).json({ success: true, password });
    } else {
      const errorText = await response.text();
      res.status(500).json({ success: false, error: errorText });
    }
  }