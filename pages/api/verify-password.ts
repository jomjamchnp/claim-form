import { google } from "googleapis";
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

function hmacSecret(): string {
  // Use server-side env vars as signing material — no extra env var needed
  return `${process.env.SHEET_ID ?? ""}:${process.env.LINE_TOKEN ?? ""}:scan`;
}

export function generateToken(): string {
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", hmacSecret()).update(ts).digest("hex");
  return `${ts}.${sig}`;
}

export function isValidScanToken(token: string): boolean {
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", hmacSecret()).update(ts).digest("hex");
  return sig === expected;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password } = req.body as { password?: string };

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT!);
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Password!A1",
    });

    const realPassword = response.data.values?.[0]?.[0] ?? null;
    console.log("🚀 ~ handler ~ realPassword:", realPassword)
    if (!realPassword) {
      return res.status(404).json({ error: "No password found" });
    }

    if (password === realPassword) {
      return res.status(200).json({ valid: true, token: generateToken() });
    } else {
      return res.status(200).json({ valid: false });
    }
  } catch {
    res.status(500).json({ error: "Failed to verify password" });
  }
}
