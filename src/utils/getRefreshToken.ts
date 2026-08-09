import { google } from "googleapis";
import http from "http";
import url from "url";
import dotenv from "dotenv";
import { logger } from "./logger";

// Load existing env variables
dotenv.config();

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const isConfigured = (val?: string) => !!val && val.trim() !== "" && !val.includes("your_") && !val.includes("_here");

  if (!isConfigured(clientId) || !isConfigured(clientSecret)) {
    logger.error("GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET chưa được điền trong file .env!", undefined, "OAUTH-HELPER");
    logger.info("Vui lòng thực hiện các bước sau trước khi chạy lại:", "OAUTH-HELPER");
    console.log(`
1. Truy cập Google Cloud Console: https://console.cloud.google.com/
2. Chọn project và đến "APIs & Services" -> "Credentials".
3. Bấm "Create Credentials" -> "OAuth client ID".
4. Chọn loại Ứng dụng: "Web application".
5. Mục "Authorized redirect URIs", thêm chính xác:
   ${REDIRECT_URI}
6. Bấm "Create", sao chép Client ID và Client Secret vào file .env:
   GOOGLE_CLIENT_ID=client_id_thuc_te
   GOOGLE_CLIENT_SECRET=client_secret_thuc_te
7. Chạy lại lệnh này!
`);
    process.exit(1);
  }

  // Initialize OAuth2 client
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  // Generate authorization URL
  const scopes = ["https://www.googleapis.com/auth/drive"];
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // Bắt buộc để nhận refresh_token
    prompt: "consent",      // Ép hiện bảng đồng ý để luôn trả về refresh_token
    scope: scopes
  });

  logger.info("Starting temporary local callback server on port " + PORT, "OAUTH-HELPER");

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url && req.url.startsWith("/oauth2callback")) {
        const queryParams = url.parse(req.url, true).query;
        const code = queryParams.code as string;

        if (code) {
          logger.success("Callback received successfully! Exchanging authorization code...", "OAUTH-HELPER");
          
          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code);
          
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Xác thực thành công!</h1><p>Bạn có thể đóng tab này và quay lại cửa sổ Terminal để lấy Refresh Token.</p>");

          logger.info("==================================================", "OAUTH-HELPER");
          logger.success("OAUTH 2.0 REFRESH TOKEN GENERATED SUCCESSFULLY!", "OAUTH-HELPER");
          logger.info("Copy the following line directly into your .env file:", "OAUTH-HELPER");
          console.log(`\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
          logger.info("==================================================", "OAUTH-HELPER");

          // Shut down server
          server.close();
          process.exit(0);
        } else {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("No code returned from Google.");
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    } catch (err: any) {
      logger.error("Error exchanging token", err, "OAUTH-HELPER");
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Lỗi trao đổi token: " + (err.message || String(err)));
      }
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    logger.success("Callback server active! Please authorize your 5TB Google One account by clicking this URL:", "OAUTH-HELPER");
    console.log(`\n\x1b[36m\x1b[1m${authorizeUrl}\x1b[0m\n`);
  });
}

main().catch((err) => {
  logger.error("Critical OAuth helper error", err, "OAUTH-HELPER");
  process.exit(1);
});
