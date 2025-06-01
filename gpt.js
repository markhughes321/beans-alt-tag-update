const OpenAI = require('openai');

// Define JSON Schema for alt tag
const altTagSchema = {
  type: "object",
  properties: {
    altText: {
      type: "string",
      description: "SEO-optimized alt tag for Beans.ie image",
      minLength: 60,
      maxLength: 125,
      pattern: "(?i)coffee" // Case-insensitive "coffee" requirement
    }
  },
  required: ["altText"],
  additionalProperties: false
};

class GPTClient {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateAltTag({ imageUrl, imageTitle, businessContext }) {
    const prompt = `
      You are Beans.ie Image Alt Tag Assistant, an expert in the business’s products, philosophy, events, equipment, collaborations, and brand tone.
      ${businessContext}
      Analyze the image at the provided URL and use the image title "${imageTitle}" as context.
      Generate an SEO-optimized alt tag for the Beans.ie website that adheres to the following JSON schema:
      ${JSON.stringify(altTagSchema, null, 2)}
      Requirements:
      - Be descriptive and specific to the visual content, incorporating relevant details from the title.
      - Include keywords like "specialty coffee," "coffee beans," or "coffee brewing."
      - Reflect Beans.ie’s clear, informative, and approachable tone.
      - Align with the mission to make the world’s finest specialty coffee accessible.
      - Avoid identifying individuals’ names (e.g., use "Dak founders" instead).
      - If image analysis fails (e.g., unsupported format or unclear content), generate a generic coffee-related alt tag using the title and context.
      - Ensure the output is a single line, free of newlines, colons, or error messages like "unable to."
      - Avoid keyword stuffing or generic terms like "image of."
      - Optimize for screen readers (clear, concise, no redundancy).
      Examples:
      - "Brazil smallholder coffee farmers picking coffee beans from trees"
      - "NBA Blend from People Possession Coffee Roastery, available on Beans.ie"
      - "Founders of Dak Coffee Roasters in their new cafe"
      If the image cannot be analyzed, return a generic tag like:
      - "${imageTitle.split('-')[0].replace(/_/g, ' ')} specialty coffee on Beans.ie"
    `;

    try {
      let attempts = 0;
      const maxAttempts = 3;
      let response;

      while (attempts < maxAttempts) {
        try {
          response = await this.openai.beta.chat.completions.parse({
            model: 'gpt-4o-2024-08-06',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant for Beans.ie.',
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: imageUrl } },
                ],
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "alt_tag_response",
                strict: true,
                schema: altTagSchema
              }
            },
            max_tokens: 150, // Increased to accommodate JSON structure
            temperature: 0.6,
          });

          if (response.choices[0].message.refusal) {
            console.warn(`Model refused to process image ${imageTitle}: ${response.choices[0].message.refusal}`);
            break;
          }

          const parsed = JSON.parse(response.choices[0].message.content);
          const altText = parsed.altText.trim();

          // Additional validation for accessibility
          if (
            altText.toLowerCase().includes('image of') ||
            altText.toLowerCase().includes('picture of') ||
            altText.match(/[^a-zA-Z0-9\s,.&-]/) // Avoid special characters
          ) {
            console.warn(`Accessibility issue in alt tag for ${imageTitle}: ${altText}`);
            throw new Error('Invalid alt tag format');
          }

          console.log(`Generated alt tag for ${imageTitle}: ${altText}`);
          return altText;
        } catch (error) {
          if (error.message.includes('rate limit') && attempts < maxAttempts - 1) {
            attempts++;
            const delay = (1000 * Math.pow(2, attempts)) + (Math.random() * 100);
            console.log(`OpenAI rate limit hit, retrying (${attempts}/${maxAttempts}) after ${delay.toFixed(0)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.error(`Error generating alt tag for ${imageTitle}:`, error.message);
            break;
          }
        }
      }

      // Fallback: Generate generic tag using filename
      let fallbackText = `${imageTitle.split('-')[0].replace(/_/g, ' ')} specialty coffee on Beans.ie`;
      if (fallbackText.length < 60) {
        fallbackText = `${fallbackText} from global roasters`;
      }
      if (fallbackText.length > 125) {
        fallbackText = fallbackText.substring(0, 125);
      }

      // Final validation
      if (
        fallbackText.length >= 60 &&
        fallbackText.length <= 125 &&
        fallbackText.toLowerCase().includes('coffee') &&
        !fallbackText.match(/[^a-zA-Z0-9\s,.&-]/)
      ) {
        console.log(`Using fallback alt tag for ${imageTitle}: ${fallbackText}`);
        return fallbackText;
      }

      console.warn(`No valid alt tag generated for ${imageTitle}`);
      return null; // Leave blank if all else fails
    } catch (error) {
      console.error('Unexpected error in alt tag generation:', error.message);
      return null;
    }
  }
}

module.exports = GPTClient;