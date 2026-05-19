import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";
import { logger } from "../../utils/logger";

// Bind the bundled ffmpeg binary to fluent-ffmpeg
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  logger.info(`FFmpeg binary resolved via ffmpeg-static at: ${ffmpegPath}`, "VIDEO-COMPILER");
} else {
  logger.warn("ffmpeg-static failed to resolve path. Expecting globally installed FFmpeg.", "VIDEO-COMPILER");
}

interface VideoOptions {
  slidesDir: string;
  outputVideoPath: string;
  bgMusicPath?: string;
  slideDurationSeconds: number;
  audioTracksDir?: string; // Optional folder containing slide_01.mp3, slide_02.mp3, etc.
}

/**
 * Compiles a folder of slide PNGs and optional TTS audio files into a 9:16 MP4 video.
 * Supports perfectly synchronized individual-slide duration matching.
 */
export async function compileVideo(options: VideoOptions): Promise<string> {
  const { slidesDir, outputVideoPath, bgMusicPath, slideDurationSeconds, audioTracksDir } = options;

  logger.info("Initializing video compilation...", "VIDEO-COMPILER");

  // Verify slide images
  const slideFiles = fs.readdirSync(slidesDir)
    .filter((f) => f.startsWith("slide_") && f.endsWith(".png"))
    .sort();

  if (slideFiles.length === 0) {
    throw new Error("No slide images found to compile video.");
  }

  // Ensure target folder for output video exists
  const outputDir = path.dirname(outputVideoPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  } else if (fs.existsSync(outputVideoPath)) {
    fs.unlinkSync(outputVideoPath); // Delete old video to avoid overlapping
  }

  // Check if we are running in Synchronized Audio Mode
  const useSynchronizedTts = audioTracksDir && fs.existsSync(audioTracksDir);

  if (useSynchronizedTts) {
    logger.info("Synchronized TTS Mode detected. Compiling individual synchronized slide clips...", "VIDEO-COMPILER");
    const slideClipPaths: string[] = [];

    // 1. Package each slide with its voice-over into a micro-clip
    for (let i = 0; i < slideFiles.length; i++) {
      const slideFileName = slideFiles[i];
      const indexStr = slideFileName.replace("slide_", "").replace(".png", "");
      const slideImagePath = path.join(slidesDir, slideFileName);
      const audioFileName = `slide_${indexStr}.mp3`;
      const audioPath = path.join(audioTracksDir!, audioFileName);
      const slideClipPath = path.join(slidesDir, `clip_${indexStr}.mp4`);

      const hasVoice = fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0;
      logger.info(`Packaging clip ${i + 1}/${slideFiles.length}: slide_${indexStr} (Voice: ${hasVoice ? "YES" : "NO - Silent Fallback"})`, "VIDEO-COMPILER");

      await new Promise<void>((resolve, reject) => {
        let cmd = ffmpeg()
          .input(slideImagePath)
          .inputOptions(["-loop 1"]);

        if (hasVoice) {
          // If voice exists, match slide duration exactly to voice length
          cmd = cmd
            .input(audioPath)
            .outputOptions([
              "-c:v libx264",
              "-tune stillimage",
              "-c:a aac",
              "-ac 2",      // Force stereo
              "-ar 44100",  // Force 44.1kHz
              "-b:a 128k",
              "-pix_fmt yuv420p",
              "-af apad=pad_dur=4", // Rest exactly 4 seconds after voice ends
              "-shortest"           // Terminate slide clip when the padded voice ends
            ]);
        } else {
          // Fallback to a default silent slide duration
          cmd = cmd
            .input("anullsrc")
            .inputOptions(["-f lavfi"])
            .outputOptions([
              "-c:v libx264",
              "-tune stillimage",
              "-c:a aac",
              "-ac 2",      // Force stereo
              "-ar 44100",  // Force 44.1kHz
              "-b:a 128k",
              "-pix_fmt yuv420p",
              `-t ${slideDurationSeconds}` // Default to 5 seconds
            ]);
        }

        cmd
          .save(slideClipPath)
          .on("end", () => {
            slideClipPaths.push(slideClipPath);
            resolve();
          })
          .on("error", (err) => {
            logger.error(`Failed to compile individual clip for index: ${indexStr}`, err, "VIDEO-COMPILER");
            reject(err);
          });
      });
    }

    // 2. Concatenate individual MP4 clips using FFmpeg's concat demuxer
    logger.info("Merging individual clips using copy demuxer...", "VIDEO-COMPILER");
    const concatManifestPath = path.join(slidesDir, "concat.txt");
    const manifestContent = slideClipPaths
      .map((clipPath) => `file '${path.basename(clipPath)}'`)
      .join("\n");

    fs.writeFileSync(concatManifestPath, manifestContent);
    const rawConcatPath = path.join(slidesDir, "raw_concat.mp4");

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatManifestPath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(["-c copy"]) // Do NOT re-encode, super fast copy merge
        .save(rawConcatPath)
        .on("end", () => resolve())
        .on("error", (err) => {
          logger.error("Clips concatenation failed.", err, "VIDEO-COMPILER");
          reject(err);
        });
    });

    // 3. Mix looped background music into the concatenated video
    const hasBgMusic = bgMusicPath && fs.existsSync(bgMusicPath);
    if (hasBgMusic) {
      logger.info(`Mixing background music from: ${bgMusicPath} with announcer stream...`, "VIDEO-COMPILER");
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(rawConcatPath)
          .input(bgMusicPath)
          .inputOptions(["-stream_loop -1"]) // Infinite loop for background track
          .outputOptions([
            "-c:v copy", // Do NOT re-encode video stream, keeps it extremely fast
            '-filter_complex [0:a]volume=1.3[voice];[1:a]volume=0.15[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[a]',
            "-map 0:v",
            "-map [a]",
            "-c:a aac",
            "-b:a 128k"
          ])
          .save(outputVideoPath)
          .on("end", () => resolve())
          .on("error", (err) => {
            logger.error("Background audio mixing failed.", err, "VIDEO-COMPILER");
            reject(err);
          });
      });
    } else {
      logger.warn("No background music found or audio file missing. Copying announcer-only audio.", "VIDEO-COMPILER");
      fs.copyFileSync(rawConcatPath, outputVideoPath);
    }

    // 4. Perform hygiene clean-up of temporary files
    logger.info("Cleaning up temporary micro-clips...", "VIDEO-COMPILER");
    try {
      if (fs.existsSync(concatManifestPath)) fs.unlinkSync(concatManifestPath);
      if (fs.existsSync(rawConcatPath)) fs.unlinkSync(rawConcatPath);
      for (const clipPath of slideClipPaths) {
        if (fs.existsSync(clipPath)) fs.unlinkSync(clipPath);
      }
      logger.success("Temporary files cleaned up successfully.", "VIDEO-COMPILER");
    } catch (cleanErr) {
      logger.warn(`Non-blocking cleanup warning: ${cleanErr}`, "VIDEO-COMPILER");
    }

    logger.success(`Video compiled successfully with synchronized TTS! Saved to: ${outputVideoPath}`, "VIDEO-COMPILER");
    return outputVideoPath;

  } else {
    // FALLBACK: Backward-compatible Silent Standard Slideshow mode
    logger.info(`Running in standard fallback slideshow mode (Fixed ${slideDurationSeconds}s/slide)...`, "VIDEO-COMPILER");
    const totalSlides = slideFiles.length;
    const totalDuration = totalSlides * slideDurationSeconds;
    const inputPattern = path.join(slidesDir, "slide_%02d.png");

    return new Promise<string>((resolve, reject) => {
      let command = ffmpeg()
        .input(inputPattern)
        .inputOptions([`-framerate 1/${slideDurationSeconds}`]);

      const hasAudio = bgMusicPath && fs.existsSync(bgMusicPath);
      if (hasAudio) {
        logger.info(`Embedding background music from: ${bgMusicPath}`, "VIDEO-COMPILER");
        command = command
          .input(bgMusicPath)
          .inputOptions(["-stream_loop -1"]);
      } else {
        logger.warn("No background music found or audio file missing. Creating silent video.", "VIDEO-COMPILER");
      }

      command = command
        .videoCodec("libx264")
        .outputOptions([
          "-pix_fmt yuv420p",
          "-r 25",
          `-t ${totalDuration}`
        ]);

      if (hasAudio) {
        command = command
          .audioCodec("aac")
          .audioBitrate("128k")
          .outputOptions(["-map 0:v:0", "-map 1:a:0", "-shortest"]);
      }

      command
        .save(outputVideoPath)
        .on("end", () => {
          logger.success(`Video compiled successfully! Saved to: ${outputVideoPath}`, "VIDEO-COMPILER");
          resolve(outputVideoPath);
        })
        .on("error", (err) => {
          logger.error("FFmpeg compilation failed.", err, "VIDEO-COMPILER");
          reject(err);
        });
    });
  }
}
