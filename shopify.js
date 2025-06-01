const fetch = require('node-fetch');

class ShopifyClient {
  constructor({ shopName, accessToken }) {
    this.endpoint = `https://${shopName}/admin/api/2025-04/graphql.json`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    };
  }

  // Helper to execute GraphQL requests
  async request(query, variables = {}) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ query, variables }),
        });
        const json = await response.json();
        if (!response.ok) {
          if (response.status === 429) {
            attempts++;
            console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              type: 'warn',
              message: `Rate limit hit (429), retrying (${attempts}/${maxAttempts}) after delay`,
              details: { delay: 1000 * attempts }
            }, null, 2));
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            continue;
          } else if (json.errors?.some(e => e.extensions?.code === 'MAX_COST_EXCEEDED')) {
            throw new Error('Query cost exceeded. Reduce the "first" parameter or use bulk operations.');
          } else {
            throw new Error(`HTTP ${response.status}: ${json.errors?.map(e => e.message).join(', ') || response.statusText}`);
          }
        }
        if (json.errors) {
          throw new Error(`GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
        }
        return json.data;
      } catch (error) {
        attempts++;
        if ((error.message.includes('ETIMEDOUT') || error.message.includes('429')) && attempts < maxAttempts) {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: `Network error, retrying (${attempts}/${maxAttempts}) after delay`,
            details: { error: error.message, delay: 1000 * attempts }
          }, null, 2));
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        } else {
          throw error;
        }
      }
    }
    throw new Error('Max retry attempts reached for GraphQL request.');
  }

  // Verify required API scopes
  async verifyScopes(requiredScopes) {
    const query = `
      query {
        appInstallation {
          accessScopes {
            handle
          }
        }
      }
    `;
    try {
      const response = await this.request(query);
      const grantedScopes = response.appInstallation.accessScopes.map(s => s.handle);
      return requiredScopes.every(scope => grantedScopes.includes(scope));
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'error',
        message: 'Error verifying scopes',
        details: { error: error.message }
      }, null, 2));
      throw error;
    }
  }

  // Fetch all images using the files query
  async getAllImages() {
    let images = [];
    let after = null;
    let hasNextPage = true;
    const query = `
      query Files($first: Int, $after: String) {
        files(first: $first, after: $after, query: "media_type:image") {
          edges {
            node {
              ... on MediaImage {
                id
                alt
                image {
                  url
                }
                mediaContentType
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
    try {
      while (hasNextPage) {
        const response = await this.request(query, { first: 50, after });
        if (!response?.files) {
          throw new Error('Invalid response from Shopify GraphQL API');
        }
        const files = response.files;
        images.push(...files.edges.map(edge => {
          // Extract filename from image.url or fallback to id
          let filename = edge.node.id.split('/').pop();
          if (edge.node.image?.url) {
            const urlParts = edge.node.image.url.split('/');
            filename = urlParts[urlParts.length - 1].split('?')[0] || filename;
          }
          return {
            id: edge.node.id,
            altText: edge.node.alt,
            filename,
            url: edge.node.image?.url || '',
          };
        }));
        hasNextPage = files.pageInfo.hasNextPage;
        after = files.pageInfo.endCursor;
      }
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'error',
        message: 'Error fetching images',
        details: { error: error.message }
      }, null, 2));
      throw error;
    }
    return images;
  }

  // Update alt tag for a specific image
  async updateImageAltTag(imageId, altText) {
    const mutation = `
      mutation fileUpdate($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files {
            id
            alt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    try {
      const response = await this.request(mutation, {
        files: [{ id: imageId, alt: altText }],
      });
      const userErrors = response.fileUpdate?.userErrors || [];
      if (userErrors.length > 0) {
        throw new Error(`Failed to update image ${imageId}: ${userErrors.map(e => e.message).join(', ')}`);
      }
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'error',
        message: `Error updating alt tag for image`,
        details: { imageId, error: error.message }
      }, null, 2));
      throw error;
    }
  }
}

module.exports = ShopifyClient;