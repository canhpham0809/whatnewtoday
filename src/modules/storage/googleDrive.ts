import { google } from "googleapis";
import fs from "fs";
import path from "path";
import env from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * Creates a Google Drive folder under the configured root or an explicit parent folder.
 */
export async function createDriveFolder(
  folderName: string,
  parentFolderId?: string
): Promise<{ folderId: string; webViewUrl: string }> {
  logger.info(`Creating Google Drive folder: ${folderName}`, "STORAGE-DRIVE");

  if (env.isDriveMock) {
    logger.warn("Google Drive Mock Mode is active. Skipping folder creation.", "STORAGE-DRIVE");
    return {
      folderId: `mock-folder-id-${Date.now()}`,
      webViewUrl: `https://drive.google.com/mock/folder/d/mock-folder-id-${Date.now()}`
    };
  }

  try {
    let auth: any;
    const scopes = ["https://www.googleapis.com/auth/drive"];

    if (env.googleClientId && env.googleClientSecret && env.googleRefreshToken) {
      logger.info("Authenticating with Google OAuth 2.0 User Account (5TB Quota)...", "STORAGE-DRIVE");
      const oauth2Client = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
      oauth2Client.setCredentials({ refresh_token: env.googleRefreshToken });
      auth = oauth2Client;
    } else {
      logger.info("Authenticating with Google Service Account...", "STORAGE-DRIVE");
      auth = new google.auth.JWT(env.googleClientEmail, undefined, env.googlePrivateKey, scopes);
    }

    const drive = google.drive({ version: "v3", auth });
    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId || env.googleDriveFolderId]
    };

    const folderResponse = await drive.files.create({
      requestBody: folderMetadata,
      fields: "id, webViewLink"
    });

    const folderId = folderResponse.data.id || "";
    const folderUrl = folderResponse.data.webViewLink || "";

    logger.success(`Drive folder created successfully! ID: ${folderId}`, "STORAGE-DRIVE");
    try {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: { role: "reader", type: "anyone" }
      });
      logger.success("Permissions updated. Folder is now viewable by anyone with the link.", "STORAGE-DRIVE");
    } catch (permError) {
      logger.warn(`Could not set public permissions on folder: ${folderId}`, "STORAGE-DRIVE");
    }

    return { folderId, webViewUrl: folderUrl };
  } catch (error: any) {
    logger.error("Failed to create Google Drive folder.", error, "STORAGE-DRIVE");
    return {
      folderId: `failed-folder-id-${Date.now()}`,
      webViewUrl: `https://drive.google.com/failed/folder/d/failed-folder-id-${Date.now()}`
    };
  }
}

/**
 * Uploads a local file to a specified Google Drive folder.
 * Returns the uploaded file's ID and public web view URL.
 */
export async function uploadVideoToGoogleDrive(
  localFilePath: string,
  fileName: string
): Promise<{ fileId: string; webViewUrl: string }> {
  logger.info(`Starting file upload to Google Drive: ${fileName}`, "STORAGE-DRIVE");
  
  if (env.isDriveMock) {
    logger.warn("Google Drive Mock Mode is active. Skipping upload.", "STORAGE-DRIVE");
    logger.info(`[MOCK] File saved locally only at: ${localFilePath}`, "STORAGE-DRIVE");
    
    return {
      fileId: `mock-drive-id-${Date.now()}`,
      webViewUrl: `https://drive.google.com/mock/file/d/mock-drive-id-${Date.now()}`
    };
  }
  
  try {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file not found for upload: ${localFilePath}`);
    }
    
    // 1. Initialize Google Auth client (OAuth 2.0 or Service Account JWT)
    let auth: any;
    const scopes = ["https://www.googleapis.com/auth/drive"];

    if (env.googleClientId && env.googleClientSecret && env.googleRefreshToken) {
      logger.info("Authenticating with Google OAuth 2.0 User Account (5TB Quota)...", "STORAGE-DRIVE");
      const oauth2Client = new google.auth.OAuth2(
        env.googleClientId,
        env.googleClientSecret
      );
      oauth2Client.setCredentials({
        refresh_token: env.googleRefreshToken
      });
      auth = oauth2Client;
    } else {
      logger.info("Authenticating with Google Service Account...", "STORAGE-DRIVE");
      auth = new google.auth.JWT(
        env.googleClientEmail,
        undefined,
        env.googlePrivateKey,
        scopes
      );
    }
    
    const drive = google.drive({ version: "v3", auth });
    
    // 2. Perform File Upload
    logger.info("Uploading file content stream to Google Drive...", "STORAGE-DRIVE");
    const fileMetadata = {
      name: fileName,
      parents: [env.googleDriveFolderId]
    };
    
    const media = {
      mimeType: "video/mp4",
      body: fs.createReadStream(localFilePath)
    };
    
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink"
    });
    
    const fileId = response.data.id || "";
    const webViewUrl = response.data.webViewLink || "";
    
    logger.success(`Upload successful! File ID: ${fileId}`, "STORAGE-DRIVE");
    
    // 3. Make the file readable/sharable (optional, but highly useful for distribution)
    try {
      logger.info("Configuring public reading permissions for the file...", "STORAGE-DRIVE");
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: "reader",
          type: "anyone"
        }
      });
      logger.success("Permissions updated. File is now viewable by anyone with the link.", "STORAGE-DRIVE");
    } catch (permError) {
      logger.warn(`Could not set public permissions on file: ${fileId}. It remains accessible only to the owner account.`, "STORAGE-DRIVE");
    }
    
    return { fileId, webViewUrl };
  } catch (error: any) {
    logger.error("Failed to upload video to Google Drive. Switching to mock storage values.", error, "STORAGE-DRIVE");
    
    // Recovery path: return mock details so pipeline doesn't break
    return {
      fileId: `failed-upload-id-${Date.now()}`,
      webViewUrl: `https://drive.google.com/failed/file/d/failed-upload-id-${Date.now()}`
    };
  }
}

/**
 * Creates a dedicated release folder on Google Drive, then uploads the video and all rendered PNG slide images into it.
 * Returns the folder's ID and public web view URL.
 */
export async function uploadNewsReleaseToGoogleDrive(
  folderName: string,
  localVideoPath: string,
  videoFileName: string,
  localSlidesDir: string,
  parentFolderId?: string
): Promise<{ folderId: string; webViewUrl: string }> {
  logger.info(`Starting Release upload to Google Drive. Target folder: ${folderName}`, "STORAGE-DRIVE");

  if (env.isDriveMock) {
    logger.warn("Google Drive Mock Mode is active. Skipping upload.", "STORAGE-DRIVE");
    return {
      folderId: `mock-folder-id-${Date.now()}`,
      webViewUrl: `https://drive.google.com/mock/folder/d/mock-folder-id-${Date.now()}`
    };
  }

  try {
    // 1. Authenticate with Google Drive
    let auth: any;
    const scopes = ["https://www.googleapis.com/auth/drive"];

    if (env.googleClientId && env.googleClientSecret && env.googleRefreshToken) {
      logger.info("Authenticating with Google OAuth 2.0 User Account (5TB Quota)...", "STORAGE-DRIVE");
      const oauth2Client = new google.auth.OAuth2(
        env.googleClientId,
        env.googleClientSecret
      );
      oauth2Client.setCredentials({ refresh_token: env.googleRefreshToken });
      auth = oauth2Client;
    } else {
      logger.info("Authenticating with Google Service Account...", "STORAGE-DRIVE");
      auth = new google.auth.JWT(
        env.googleClientEmail,
        undefined,
        env.googlePrivateKey,
        scopes
      );
    }

    const drive = google.drive({ version: "v3", auth });

    // 2. Create dedicated folder in Google Drive
    logger.info("Creating dedicated folder on Google Drive...", "STORAGE-DRIVE");
    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId || env.googleDriveFolderId] // Inside configured parent folder ID or explicit parent folder
    };

    const folderResponse = await drive.files.create({
      requestBody: folderMetadata,
      fields: "id, webViewLink"
    });

    const folderId = folderResponse.data.id || "";
    const folderUrl = folderResponse.data.webViewLink || "";
    logger.success(`Drive folder created successfully! ID: ${folderId}`, "STORAGE-DRIVE");

    // Make the folder publicly readable
    try {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: {
          role: "reader",
          type: "anyone"
        }
      });
      logger.success("Permissions updated. Folder is now viewable by anyone with the link.", "STORAGE-DRIVE");
    } catch (permError) {
      logger.warn(`Could not set public permissions on folder: ${folderId}`, "STORAGE-DRIVE");
    }

    // 3. Upload Video (Optional)
    if (localVideoPath && fs.existsSync(localVideoPath)) {
      logger.info(`Uploading video to Drive folder: ${videoFileName}`, "STORAGE-DRIVE");
      const videoMetadata = {
        name: videoFileName,
        parents: [folderId]
      };
      const videoMedia = {
        mimeType: "video/mp4",
        body: fs.createReadStream(localVideoPath)
      };
      await drive.files.create({
        requestBody: videoMetadata,
        media: videoMedia,
        fields: "id"
      });
      logger.success("Video uploaded successfully.", "STORAGE-DRIVE");
    } else {
      logger.info("No local video file found. Skipping video upload.", "STORAGE-DRIVE");
    }

    // 4. Upload Slide PNGs
    if (fs.existsSync(localSlidesDir)) {
      const slideFiles = fs.readdirSync(localSlidesDir)
        .filter((f) => (f.startsWith("slide_") || f === "cover.png") && f.endsWith(".png"))
        .sort();

      logger.info(`Uploading ${slideFiles.length} slide images to Drive folder...`, "STORAGE-DRIVE");
      for (const slideFile of slideFiles) {
        const slidePath = path.join(localSlidesDir, slideFile);
        const slideMetadata = {
          name: slideFile,
          parents: [folderId]
        };
        const slideMedia = {
          mimeType: "image/png",
          body: fs.createReadStream(slidePath)
        };
        await drive.files.create({
          requestBody: slideMetadata,
          media: slideMedia,
          fields: "id"
        });
        logger.info(`Uploaded slide: ${slideFile}`, "STORAGE-DRIVE");
      }
      logger.success("All slide images uploaded successfully.", "STORAGE-DRIVE");
    }

    return { folderId, webViewUrl: folderUrl };
  } catch (error: any) {
    logger.error("Failed to upload news release folder to Google Drive.", error, "STORAGE-DRIVE");
    return {
      folderId: `failed-folder-id-${Date.now()}`,
      webViewUrl: `https://drive.google.com/failed/folder/d/failed-folder-id-${Date.now()}`
    };
  }
}
