import { postCarouselToTikTok } from "../modules/social/buffer";

async function testBufferWithDriveLink() {
  console.log("Testing Buffer GraphQL API with a sample Google Drive link...");

  // Example public Google Drive image link formats
  const mockPublicImageUrls = [
    "https://fastly.picsum.photos/id/237/200/300.jpg?hmac=TmmQSbShHz9CdQm0NkEjx1Dyh_Y984R9LpNrpvH2D_U"
  ];

  try {
    const result = await postCarouselToTikTok("Test Buffer Photo Carousel 🚀", mockPublicImageUrls);
    if (result.success) {
      console.log("✅ Success! Buffer accepted the Google Drive links.");
      console.log(`Post ID: ${result.postId}`);
    } else {
      console.error("❌ Failed to push to Buffer API.");
      console.error(result.error);
    }
  } catch (error) {
    console.error("❌ Error running test:", error);
  }
}

testBufferWithDriveLink();
