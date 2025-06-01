Beans Alt Tag Update
=====================

A Node.js application to automatically generate and apply SEO-optimized alt tags for images on the Beans.ie Shopify store using OpenAI's gpt-4o model. The app fetches images from Shopify, generates descriptive alt tags, and updates them in batches with rate limit handling.

Prerequisites
-------------

-   Node.js v16.20 or higher

-   npm v8.15.0 or higher

-   Shopify Admin API access token with read_files and write_files scopes

-   OpenAI API key with access to gpt-4o vision model

Installation
------------

1.  Clone the repository:

    ```
    git clone <repository-url>
    cd beans-alt-tag-update
    ```

2.  Install dependencies:

    ```
    npm install
    ```

3.  Create a .env file in the root directory (see Environment Variables).

Environment Variables
---------------------

Create a .env file with the following:

```
SHOPIFY_SHOP_NAME=your-shopify-domain.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token
OPENAI_API_KEY=your_openai_api_key
```

-   SHOPIFY_SHOP_NAME: Your Shopify store domain (e.g., B4CD1F-0D.MYSHOPIFY.COM).

-   SHOPIFY_ACCESS_TOKEN: Shopify Admin API token with read_files and write_files scopes.

-   OPENAI_API_KEY: OpenAI API key with gpt-4o access.

Usage
-----

-   **Dry Run**: Generates alt tags without updating Shopify and logs output to console and /output/output_<timestamp>.json.

    ```
    npm run start:dry
    ```

-   **Live Run**: Generates alt tags, updates Shopify, and logs output to /output/output_<timestamp>.json.

    ```
    npm start
    ```

### Output Files

-   JSON files are saved in /output with timestamps (e.g., output_20250601_1114.json).

-   Format:

    ```
    {
      "timestamp": "2025-06-01T11:14:00Z",
      "dryRun": true,
      "batches": [
        {
          "batch": 1,
          "updates": [
            {
              "imageId": "gid://shopify/MediaImage/123456789",
              "altTag": "DAK Gallery specialty coffee brewing equipment on Beans.ie",
              "imageUrl": "https://cdn.shopify.com/.../DAK_Gallery_6-min.jpg"
            },
            ...
          ]
        },
        ...
      ]
    }
    ```

Project Structure
-----------------

-   index.js: Main application logic for fetching images, generating alt tags, and updating Shopify.

-   gpt.js: Handles OpenAI API integration for alt tag generation.

-   shopify.js: Manages Shopify GraphQL API interactions.

-   .env: Environment variables (not committed).

-   /output/: Directory for JSON output files (not committed).

-   package.json: Project dependencies and scripts.

Notes
-----

-   The app processes images in batches of 5 to avoid OpenAI rate limits (30,000 TPM).

-   Alt tags are validated to be 60-125 characters, include "coffee," and avoid errors. Invalid tags result in null (no update).

-   Output files in /output are timestamped for easy tracking.

-   Ensure Shopify API token has correct scopes (read_files, write_files).