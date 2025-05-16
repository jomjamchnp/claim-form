import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const sheets = google.sheets({ version: 'v4', auth: new google.auth.JWT(
      credentials.client_email, null, credentials.private_key, ['https://www.googleapis.com/auth/spreadsheets']
    )});
    const sheetId = process.env.SHEET_ID;
    const range = 'Password!A1';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId : sheetId,
      range,
    });

    const realPassword = response.data.values ? response.data.values[0][0] : null;

    if (!realPassword) {
      return res.status(404).json({ error: 'No password found' });
    }

    if (password === realPassword) {
      return res.status(200).json({ valid: true });
    } else {
      return res.status(200).json({ valid: false });
    }

  } catch (error) {
    res.status(500).json({ error: 'Failed to verify password' });
  }
}
