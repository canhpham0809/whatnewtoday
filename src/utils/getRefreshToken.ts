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

  if (!clientId || !clientSecret) {
    logger.error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env!", undefined, "OAUTH-HELPER");
    logger.info("Please follow these steps first:", "OAUTH-HELPER");
    console.log(`
1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Select your project and go to "APIs & Services" -> "Credentials".
3. Click "Create Credentials" -> "OAuth client ID".
4. Select Application type: "Web application".
5. Name it e.g. "Morning News CLI".
6. In "Authorized redirect URIs", add exactly:
   ${REDIRECT_URI}
7. Click "Create", copy the Client ID and Client Secret, and write them into your .env file:
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
8. Then run this script again!
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
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Xác thực thành công!</h1><p>Bạn có thể đóng tab này và quay lại cửa sổ Terminal để lấy Refresh Token.</p>");

          logger.success("Callback received successfully! Exchanging authorization code...", "OAUTH-HELPER");
          
          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code);
          
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
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Error occurred while exchanging tokens.");
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
