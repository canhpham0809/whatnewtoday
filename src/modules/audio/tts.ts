import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs";
import path from "path";
import { logger } from "../../utils/logger";

/**
 * Executes a single speech synthesis attempt.
 */
async function attemptSynthesize(text: string, outputPath: string): Promise<string> {
  const tts = new MsEdgeTTS();
  const voice = process.env.TTS_VOICE || "vi-VN-HoaiMyNeural";
  
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  
  const fileStream = fs.createWriteStream(outputPath);
  const ttsStream = tts.toStream(text);
  
  ttsStream.audioStream.pipe(fileStream);
  
  await new Promise<void>((resolve, reject) => {
    fileStream.on("finish", () => {
      try {
        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
          reject(new Error("Synthesized audio file is empty (0 bytes). Connection might be rate-limited."));
        } else {
          resolve();
        }
      } catch (statErr) {
        reject(statErr);
      }
    });
    fileStream.on("error", (err) => reject(err));
    ttsStream.audioStream.on("error", (err) => reject(err));
  });
  
  return outputPath;
}

/**
 * Synthesizes a news-anchor speech for the given text, featuring automatic retries and backoffs.
 */
export async function synthesizeSpeech(text: string, outputPath: string): Promise<string> {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const voice = process.env.TTS_VOICE || "vi-VN-HoaiMyNeural";
  logger.info(`Synthesizing speech with voice ${voice} (${text.length} chars)...`, "TTS");
  
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await attemptSynthesize(text, outputPath);
      logger.success(`Speech synthesized successfully at: ${outputPath} (Attempt ${attempt}/${maxRetries})`, "TTS");
      return outputPath;
    } catch (err: any) {
      logger.warn(`TTS attempt ${attempt}/${maxRetries} failed: ${err.message || err}`, "TTS");
      
      // Immediate cleanup of failed/empty files
      try {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch (_) {}
      
      if (attempt === maxRetries) {
        logger.error(`All ${maxRetries} speech synthesis attempts failed.`, err, "TTS");
        throw err;
      }
      
      // Delay before next attempt (exponential backoff: 5s, 10s, 15s, 20s)
      const backoffMs = attempt * 5000;
      logger.info(`Retrying in ${backoffMs / 1000}s...`, "TTS");
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  
  throw new Error("Unexpected end of synthesis loop.");
}
