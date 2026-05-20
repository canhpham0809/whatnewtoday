import path from "path";
import fs from "fs";
import { createDriveFolder, uploadNewsReleaseToGoogleDrive } from "../modules/storage/googleDrive";
import { VideoHistoryRepository } from "../modules/database/repositories";
import { logger } from "../utils/logger";

async function main() {
  try {
    const slidesDir = path.resolve(process.cwd(), "output", "test_gold");
    if (!fs.existsSync(slidesDir)) {
      console.error("Slides folder not found:", slidesDir);
      process.exit(1);
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const rootName = `TEST_UPLOAD_${ts}`;

    logger.info(`Creating root folder: ${rootName}`, "TEST-UPLOAD");
    const root = await createDriveFolder(rootName);
    logger.info(`Root created: ${root.folderId} -> ${root.webViewUrl}`, "TEST-UPLOAD");

    // Record the root folder link into Video History so pipelines can reference it later
    try {
      const record = await VideoHistoryRepository.createVideoRecord(rootName, root.folderId, root.webViewUrl, { source: "testUploadDrive" });
      logger.info(`Recorded root folder in VideoHistory: ${record.id}`, "TEST-UPLOAD");
    } catch (recErr: any) {
      logger.warn(`Failed to record root folder in VideoHistory: ${recErr?.message || recErr}`, "TEST-UPLOAD");
    }

    const childName = `${rootName} - slides`;
    logger.info(`Uploading slides under child folder name: ${childName}`, "TEST-UPLOAD");
    const res = await uploadNewsReleaseToGoogleDrive(childName, "", "", slidesDir, root.folderId);

    logger.info(`Upload result: folderId=${res.folderId} url=${res.webViewUrl}`, "TEST-UPLOAD");
    console.log("DONE", res);
  } catch (err: any) {
    console.error("Test upload failed:", err);
    process.exit(1);
  }
}

main();
