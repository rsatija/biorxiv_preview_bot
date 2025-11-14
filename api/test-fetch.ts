import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

// Same regex and logic from the main code
const DOI_RE = /(10\.1101\/\d{4}\.\d{2}\.\d{2}\.\d+)(?:v\d+)?/;

function extractDoi(url: string): string | null {
  const m = DOI_RE.exec(url);
  if (!m) return null;
  return m[1]; // without the version suffix
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = `[${new Date().toISOString()}]`;
  console.log(`${requestId} ========== Test Fetch Handler Called ==========`);
  
  // Allow GET requests for easy browser testing
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Test URL from the test script (can be overridden via query param)
  const testUrl = (req.query.url as string) || 'https://www.biorxiv.org/content/10.1101/2025.05.12.653376v2';
  
  const logs: string[] = [];
  const log = (msg: string) => {
    const logMsg = `${new Date().toISOString()}: ${msg}`;
    console.log(logMsg);
    logs.push(logMsg);
  };

  log('='.repeat(60));
  log('TESTING bioRxiv API CALL ON VERCEL');
  log('='.repeat(60));
  log(`Original URL: ${testUrl}`);

  let apiUrl: string;
  let startTime: number;

  try {
    // Extract DOI
    const doi = extractDoi(testUrl);
    log(`Extracted DOI: ${doi || 'FAILED'}`);
    
    if (!doi) {
      res.status(400).json({
        error: 'Could not extract DOI from URL',
        url: testUrl,
        logs,
      });
      return;
    }

    // Determine server
    let server = 'biorxiv';
    if (testUrl.includes('medrxiv.org')) {
      server = 'medrxiv';
    }

    // Construct API URL (same as in fetchRxivMetadata)
    apiUrl = `https://api.${server}.org/details/${server}/${doi}/na/json`;
    log(`API URL: ${apiUrl}`);

    log('\nMaking request with node-fetch...\n');

    startTime = Date.now();

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

    const resp = await Promise.race([fetchPromise, timeoutPromise]) as any;
    const fetchDuration = Date.now() - startTime;
    log(`✅ Request completed in ${fetchDuration}ms`);
    log(`Status: ${resp.status} ${resp.statusText}`);
    
    if (!resp.ok) {
      const errorText = await resp.text();
      log(`❌ Error response: ${errorText.substring(0, 500)}`);
      res.status(500).json({
        error: 'API request failed',
        status: resp.status,
        statusText: resp.statusText,
        errorText: errorText.substring(0, 500),
        duration: fetchDuration,
        logs,
      });
      return;
    }

    const json = await resp.json();
    log(`✅ Success! Response keys: ${Object.keys(json || {}).join(', ')}`);

    const collection = json?.collection;
    if (!Array.isArray(collection) || collection.length === 0) {
      log(`⚠️  No collection found in response`);
      res.status(500).json({
        error: 'No collection in API response',
        response: JSON.stringify(json, null, 2).substring(0, 500),
        logs,
      });
      return;
    }

    log(`✅ Collection has ${collection.length} entries`);
    const entry = collection[0];
    const result = {
      success: true,
      duration: fetchDuration,
      metadata: {
        title: (entry.title || '').trim(),
        authors: (entry.authors || '').trim(),
        abstract: (entry.abstract || '').trim(),
        date: entry.date,
        category: entry.category,
        version: entry.version,
      },
      logs,
    };

    log(`Title: ${result.metadata.title.substring(0, 100)}...`);
    log(`Authors: ${result.metadata.authors.substring(0, 100)}...`);
    log(`Abstract length: ${result.metadata.abstract.length} chars`);

    res.status(200).json(result);
  } catch (err: any) {
    const fetchDuration = startTime ? Date.now() - startTime : 0;
    log(`❌ Request failed after ${fetchDuration}ms`);
    log(`Error type: ${err.name || 'Unknown'}`);
    log(`Error message: ${err.message || 'No message'}`);
    log(`Error code: ${err.code || 'N/A'}`);
    
    if (err.stack) {
      log(`Stack trace: ${err.stack}`);
    }

    res.status(500).json({
      error: 'Request failed',
      errorType: err.name || 'Unknown',
      errorMessage: err.message || 'No message',
      errorCode: err.code || 'N/A',
      duration: fetchDuration,
      stack: err.stack,
      logs,
    });
  }
}
