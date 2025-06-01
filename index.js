const ShopifyClient = require('./shopify');
const GPTClient = require('./gpt');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function main(dryRun = false) {
  const log = (type, message, details = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    }, null, 2));
  };

  let allUpdates = [];
  try {
    log('info', 'Starting alt tag update process for Beans.ie', { dryRun });
    // Initialize Shopify client
    const shopify = new ShopifyClient({
      shopName: process.env.SHOPIFY_SHOP_NAME,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    });
    // Verify required scopes
    const requiredScopes = ['read_files', 'write_files'];
    const hasRequiredScopes = await shopify.verifyScopes(requiredScopes);
    if (!hasRequiredScopes) {
      throw new Error(`Missing required API scopes: ${requiredScopes.join(', ')}. Please re-create the app with these permissions.`);
    }
    // Fetch all images from Shopify
    log('info', 'Fetching images from Shopify');
    const images = await shopify.getAllImages();
    log('info', 'Images retrieved', { count: images.length });
    // Filter images missing alt tags and exclude unsupported formats (e.g., SVG)
    const imagesMissingAlt = images.filter(image => {
      const isMissingAlt = !image.altText || image.altText.trim() === '';
      const isSupportedFormat = !image.url.toLowerCase().endsWith('.svg');
      if (isMissingAlt && !isSupportedFormat) {
        log('warn', 'Skipping unsupported image format (SVG)', { url: image.url });
      }
      return isMissingAlt && isSupportedFormat;
    });
    log('info', 'Images missing alt tags', { count: imagesMissingAlt.length });
    if (imagesMissingAlt.length === 0) {
      log('info', 'No images need alt tag updates');
      return;
    }
    // Initialize GPT client
    const gpt = new GPTClient(process.env.OPENAI_API_KEY);
    // Create output directory
    const outputDir = path.join(__dirname, 'output');
    await fs.mkdir(outputDir, { recursive: true });
    // Generate output filename with date and time
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').split('.')[0]; // e.g., 20250601_1114
    const outputFile = path.join(outputDir, `output_${timestamp}.json`);
    // Process images in batches to avoid rate limiting
    const batchSize = 5;
    const tpmLimit = 30000;
    let estimatedTokensUsed = 0;
    const tokensPerRequest = 1000;
    for (let i = 0; i < imagesMissingAlt.length; i += batchSize) {
      const batch = imagesMissingAlt.slice(i, i + batchSize);
      const batchNumber = i / batchSize + 1;
      log('info', `Processing batch ${batchNumber} of ${Math.ceil(imagesMissingAlt.length / batchSize)}`);
      // Check TPM limit
      if (estimatedTokensUsed + (batch.length * tokensPerRequest) > tpmLimit * 0.9) {
        log('warn', `Approaching OpenAI TPM limit`, { tokensUsed: estimatedTokensUsed, limit: tpmLimit });
        await new Promise(resolve => setTimeout(resolve, 60000));
        estimatedTokensUsed = 0;
      }
      const batchUpdates = [];
      const updatePromises = batch.map(async (image) => {
        try {
          const altText = await gpt.generateAltTag({
            imageUrl: image.url,
            imageTitle: image.filename || 'Coffee product image',
            businessContext: `
              Beans.ie is a multi-roaster platform showcasing specialty coffees from around the world.
              It offers limited-edition coffees from renowned international roasters, a curated marketplace
              of Ireland’s best specialty coffees roasted to order, premium home brewing equipment tested
              by experts, and educational events. The mission is to make inaccessible coffee accessible,
              with a clear, concise, and informative tone that respects the craft of specialty coffee.
            `,
          });
          estimatedTokensUsed += tokensPerRequest;
          if (dryRun) {
            batchUpdates.push({ imageId: image.id, altTag: altText, imageUrl: image.url });
            return;
          }
          if (altText) { // Only update if altText is not null
            await shopify.updateImageAltTag(image.id, altText);
            log('info', `Updated alt tag for image`, { imageId: image.id, altText });
            batchUpdates.push({ imageId: image.id, altTag: altText, imageUrl: image.url });
          } else {
            log('warn', `Skipping update for image: No valid alt tag generated`, { imageId: image.id });
            batchUpdates.push({ imageId: image.id, altTag: null, imageUrl: image.url });
          }
        } catch (error) {
          log('error', `Failed to process image`, { imageId: image.id, url: image.url, error: error.message });
          batchUpdates.push({ imageId: image.id, altTag: null, imageUrl: image.url, error: error.message });
        }
      });
      await Promise.all(updatePromises);
      allUpdates.push({ batch: batchNumber, updates: batchUpdates });
      // Output batch updates as JSON for dry run
      if (dryRun && batchUpdates.length > 0) {
        log('info', `Batch ${batchNumber} updates`, { updates: batchUpdates });
      }
    }
    log('info', 'Alt tag update process completed successfully', { outputFile });
  } catch (error) {
    log('error', 'Error in alt tag process', { error: error.message, stack: error.stack });
  } finally {
    // Write output file even on failure
    if (allUpdates.length > 0) {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:T]/g, '').split('.')[0];
      const outputFile = path.join(__dirname, 'output', `output_${timestamp}.json`);
      try {
        await fs.writeFile(outputFile, JSON.stringify({
          timestamp: now.toISOString(),
          dryRun,
          batches: allUpdates
        }, null, 2));
        log('info', 'Output saved', { outputFile });
      } catch (writeError) {
        log('error', 'Failed to write output file', { error: writeError.message });
      }
    }
  }
}
// Run the application
main(process.argv.includes('--dry-run'));