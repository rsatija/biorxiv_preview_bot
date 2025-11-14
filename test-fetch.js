const fetch = require('node-fetch');

// Same regex and logic from the main code
const DOI_RE = /(10\.1101\/\d{4}\.\d{2}\.\d{2}\.\d+)(?:v\d+)?/;

function extractDoi(url) {
  const m = DOI_RE.exec(url);
  if (!m) return null;
  return m[1]; // without the version suffix
}

// Test URL from your example
const testUrl = 'https://www.biorxiv.org/content/10.1101/2025.05.12.653376v2';

console.log('='.repeat(60));
console.log('TESTING bioRxiv API CALL');
console.log('='.repeat(60));
console.log(`Original URL: ${testUrl}`);

// Extract DOI
const doi = extractDoi(testUrl);
console.log(`Extracted DOI: ${doi}`);

// Determine server
const server = 'biorxiv'; // Would be detected as biorxiv from domain

// Construct API URL (same as in fetchRxivMetadata)
const apiUrl = `https://api.${server}.org/details/${server}/${doi}/na/json`;

console.log(`\nAPI URL that will be called:`);
console.log(apiUrl);
console.log('\n' + '='.repeat(60));

// Make the actual request
console.log('\nMaking request with node-fetch...\n');

const startTime = Date.now();

const fetchPromise = fetch(apiUrl, {
  method: 'GET',
  headers: {
    'User-Agent': 'bioRxiv-Preview-Bot/1.0',
    'Accept': 'application/json',
  },
});

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Request timeout after 10 seconds')), 10000);
});

Promise.race([fetchPromise, timeoutPromise])
  .then(async (resp) => {
    const fetchDuration = Date.now() - startTime;
    console.log(`✅ Request completed in ${fetchDuration}ms`);
    console.log(`Status: ${resp.status} ${resp.statusText}`);
    console.log(`Headers:`, resp.headers.raw());
    
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`\n❌ Error response: ${errorText.substring(0, 500)}`);
      process.exit(1);
    }
    
    const json = await resp.json();
    console.log(`\n✅ Success! Response keys:`, Object.keys(json || {}));
    
    const collection = json?.collection;
    if (!Array.isArray(collection) || collection.length === 0) {
      console.log(`\n⚠️  No collection found in response`);
      console.log(`Response structure:`, JSON.stringify(json, null, 2).substring(0, 500));
      process.exit(1);
    }
    
    console.log(`\n✅ Collection has ${collection.length} entries`);
    const entry = collection[0];
    console.log(`\nFirst entry:`);
    console.log(`  Title: ${(entry.title || '').substring(0, 100)}...`);
    console.log(`  Authors: ${(entry.authors || '').substring(0, 100)}...`);
    console.log(`  Abstract length: ${(entry.abstract || '').length} chars`);
    console.log(`  Date: ${entry.date}`);
    console.log(`  Category: ${entry.category}`);
    console.log(`  Version: ${entry.version}`);
  })
  .catch((err) => {
    const fetchDuration = Date.now() - startTime;
    console.error(`\n❌ Request failed after ${fetchDuration}ms`);
    console.error(`Error type: ${err.name || 'Unknown'}`);
    console.error(`Error message: ${err.message || 'No message'}`);
    console.error(`Error code: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`Stack trace:`, err.stack);
    }
    process.exit(1);
  });


