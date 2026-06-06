import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { Readable } from "stream";

export const config = { api: { responseLimit: false } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { fileId } = req.query;
  if (!fileId || typeof fileId !== "string") return res.status(400).end();

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT!);
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    projectId: credentials.project_id,
  });

  const drive = google.drive({ version: "v3", auth });

  try {
    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" },
    );
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    (response.data as unknown as Readable).pipe(res);
  } catch {
    res.status(404).end();
  }
}
