import { uploadNewsReleaseToGoogleDrive } from "../modules/storage/googleDrive";
import { postCarouselToTikTok } from "../modules/social/buffer";
import fs from "fs";
import path from "path";

async function runTest() {
  console.log("Creating dummy image to test Drive to Buffer pipeline...");
  const dummyDir = path.resolve(__dirname, "../../output/slides/dummy");
  if (!fs.existsSync(dummyDir)) fs.mkdirSync(dummyDir, { recursive: true });
  
  // Just use any existing file or create a blank one? 
  // Let's create a blank text file but named .png? No, Google Drive checks mime.
  // We can copy an existing PNG from assets if available, or just create a 1x1 transparent PNG.
  const dummyPngPath = path.join(dummyDir, "slide_1.png");
  const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  fs.writeFileSync(dummyPngPath, Buffer.from(base64Png, "base64"));

  console.log("Uploading dummy image to Google Drive...");
  const result = await uploadNewsReleaseToGoogleDrive("Buffer Test Folder", "", "", dummyDir);
  
  if (result.publicImageUrls && result.publicImageUrls.length > 0) {
    console.log("Drive Upload Success! Public URLs:");
    console.log(result.publicImageUrls);
    
    console.log("Pushing to Buffer API...");
    const bufferRes = await postCarouselToTikTok("Test Drive -> Buffer 🚀", result.publicImageUrls);
    if (bufferRes.success) {
      console.log("✅ FULL PIPELINE SUCCESS: Buffer accepted the Google Drive image!");
    } else {
      console.error("❌ BUFFER FAILED:", bufferRes.error);
    }
  } else {
    console.error("❌ DRIVE FAILED: No public URLs returned.");
  }
}

runTest();
