import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Load .env file in development
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    // dotenv not installed, that's okay
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const PAPERS_CHANNEL_ID = process.env.PAPERS_CHANNEL_ID; // optional

// Cache bot user ID to avoid infinite loops
let BOT_USER_ID: string | null = null;

// Fetch bot user ID on startup
async function getBotUserId(): Promise<string | null> {
  if (BOT_USER_ID) return BOT_USER_ID;
  
  try {
    const resp = await fetch('https://slack.com/api/auth.test', {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
    });
    const data = await resp.json();
    if (data.ok && data.user_id) {
      BOT_USER_ID = data.user_id;
      console.log(`Bot user ID: ${BOT_USER_ID}`);
      return BOT_USER_ID;
    }
  } catch (err) {
    console.error('Failed to fetch bot user ID:', err);
  }
  return null;
}

// Regex: Matches bioRxiv DOI in two formats:
// 1. 10.XXXXX/YYYY.MM.DD.number (with DOI prefix)
// 2. YYYY.MM.DD.number (direct format in URL path)
// Both optionally followed by vN version suffix
// Returns full DOI: 10.XXXXX/YYYY.MM.DD.number (uses 10.1101 as default prefix if not present)
const DOI_RE_WITH_PREFIX = /(10\.\d+)\/(\d{4}\.\d{2}\.\d{2}\.\d+)(?:v\d+)?/;
const DOI_RE_WITHOUT_PREFIX = /(\d{4}\.\d{2}\.\d{2}\.\d+)(?:v\d+)?/;

// PII extraction regexes for Cell.com and ScienceDirect
const CELL_PII_PATTERNS = [
  /S\d{4}\(\d{2}\)\d+-[\dX]/,  // S0092-8674(24)01234-5
  /S\d{4}\(\d{4}\)\d+-[\dX]/,  // S0092-8674(2024)01234-5
];

const SCIENCEDIRECT_PII_PATTERNS = [
  /pii\/(S\d{4}\d{10,})/,  // pii/S0092867424012345
  /\/article\/pii\/(S\d{4}\d{10,})/,  // /article/pii/S0092867424012345
];

const GENERIC_PII_PATTERN = /(S\d{4}[\d()X-]+)/;

// Middleware to parse raw body for signature verification
app.use('/api/slack-events', express.raw({ type: 'application/json' }));
app.use('/api/test-fetch', express.json());

// Verify Slack signature
function verifySlackRequest(req: express.Request, rawBody: Buffer): boolean {
  const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
  const slackSig = req.headers['x-slack-signature'] as string | undefined;

  console.log(`Signature verification - Timestamp: ${timestamp || 'MISSING'}, Signature: ${slackSig ? 'PRESENT' : 'MISSING'}`);
  console.log(`SLACK_SIGNING_SECRET present: ${SLACK_SIGNING_SECRET ? 'YES' : 'NO'}`);

  if (!timestamp || !slackSig) {
    console.log(`Missing timestamp or signature header`);
    return false;
  }

  // Prevent replay attacks (>5 min old)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  const timestampNum = parseInt(timestamp, 10);
  console.log(`Timestamp check - Request: ${timestampNum}, Five minutes ago: ${fiveMinutesAgo}`);
  if (timestampNum < fiveMinutesAgo) {
    console.log(`Request timestamp is too old (replay attack prevention)`);
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', SLACK_SIGNING_SECRET);
  hmac.update(sigBase);
  const mySig = `v0=${hmac.digest('hex')}`;

  console.log(`Computed signature: v0=${mySig.substring(3, 20)}... (truncated)`);
  console.log(`Received signature: ${slackSig.substring(0, 20)}... (truncated)`);

  try {
    const isValid = crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(slackSig));
    console.log(`Signature match: ${isValid}`);
    return isValid;
  } catch (err) {
    console.error(`Error comparing signatures:`, err);
    return false;
  }
}

function extractDoi(url: string): string | null {
  // Try to match with prefix first
  let m = DOI_RE_WITH_PREFIX.exec(url);
  if (m) {
    return `${m[1]}/${m[2]}`; // Return 10.XXXXX/YYYY.MM.DD.number
  }
  
  // If no prefix, try without prefix and use default 10.1101
  m = DOI_RE_WITHOUT_PREFIX.exec(url);
  if (m) {
    return `10.1101/${m[1]}`; // Return 10.1101/YYYY.MM.DD.number (default prefix)
  }
  
  return null;
}

type RxivServer = 'biorxiv' | 'medrxiv';
type ArticleSource = RxivServer | 'cell' | 'sciencedirect' | 'science';

// Extract PII from Cell.com or ScienceDirect URLs
function extractPII(url: string): string | null {
  // Try Cell.com patterns first
  for (const pattern of CELL_PII_PATTERNS) {
    const match = pattern.exec(url);
    if (match) {
      return match[0];
    }
  }
  
  // Try ScienceDirect patterns
  for (const pattern of SCIENCEDIRECT_PII_PATTERNS) {
    const match = pattern.exec(url);
    if (match) {
      return match[1] || match[0]; // Return captured group if available
    }
  }
  
  // Generic fallback
  const genericMatch = GENERIC_PII_PATTERN.exec(url);
  if (genericMatch) {
    return genericMatch[1];
  }
  
  return null;
}

// Extract DOI from Science.org URLs
function extractScienceDOI(url: string): string | null {
  // Science.org DOI URLs: https://www.science.org/doi/10.1126/...
  const match = url.match(/doi\/(10\.\d+\/[^\s?&#]+)/);
  if (match) {
    return match[1];
  }
  return null;
}

// PubMed API: Step 1 - ESearch to find PMID from PII
async function pubmedESearch(pii: string, retries = 2): Promise<string | null> {
  const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(pii)}[PII]&retmode=json`;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`PubMed ESearch attempt ${attempt + 1}/${retries + 1}: ${esearchUrl}`);
      const resp = await fetch(esearchUrl, {
        headers: {
          'User-Agent': 'bioRxiv-Preview-Bot/1.0',
          'Accept': 'application/json',
        },
      });
      
      if (!resp.ok) {
        if (resp.status >= 500 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        console.error(`PubMed ESearch error: ${resp.status}`);
        return null;
      }
      
      const json: any = await resp.json();
      const idList = json?.esearchresult?.idlist;
      if (Array.isArray(idList) && idList.length > 0) {
        console.log(`Found PMID: ${idList[0]}`);
        return idList[0];
      }
      console.log(`No PMID found for PII: ${pii}`);
      return null;
    } catch (err: any) {
      console.error(`PubMed ESearch error:`, err);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      return null;
    }
  }
  return null;
}

// PubMed API: Step 2 - EFetch to get full metadata from PMID
async function pubmedEFetch(pmid: string, retries = 2): Promise<any> {
  const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=xml`;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`PubMed EFetch attempt ${attempt + 1}/${retries + 1}: ${efetchUrl}`);
      const resp = await fetch(efetchUrl, {
        headers: {
          'User-Agent': 'bioRxiv-Preview-Bot/1.0',
          'Accept': 'application/xml',
        },
      });
      
      if (!resp.ok) {
        if (resp.status >= 500 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        console.error(`PubMed EFetch error: ${resp.status}`);
        return null;
      }
      
      const xmlText = await resp.text();
      return parsePubMedXML(xmlText);
    } catch (err: any) {
      console.error(`PubMed EFetch error:`, err);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      return null;
    }
  }
  return null;
}

// Search PubMed using DOI instead of PII
async function pubmedESearchByDoi(doi: string, retries = 2): Promise<string | null> {
  const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(doi)}[DOI]&retmode=json`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(esearchUrl, {
        headers: {
          'User-Agent': 'bioRxiv-Preview-Bot/1.0',
          'Accept': 'application/json',
        },
      });

      if (!resp.ok) {
        if (resp.status >= 500 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        console.error(`PubMed ESearch by DOI error: ${resp.status}`);
        return null;
      }

      const json: any = await resp.json();
      const idList = json?.esearchresult?.idlist;
      if (Array.isArray(idList) && idList.length > 0) {
        return idList[0];
      }
      return null;
    } catch (err: any) {
      console.error(`PubMed ESearch by DOI error:`, err);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      return null;
    }
  }
  return null;
}

// Parse PubMed XML response
function parsePubMedXML(xmlText: string): any {
  try {
    // Simple XML parsing using regex (for basic extraction)
    // In production, you might want to use a proper XML parser
    
    // Extract title
    const titleMatch = xmlText.match(/<ArticleTitle[^>]*>(.*?)<\/ArticleTitle>/s);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    
    // Extract authors
    const authorMatches = xmlText.matchAll(/<Author[^>]*>[\s\S]*?<LastName>([^<]+)<\/LastName>[\s\S]*?<ForeName>([^<]+)<\/ForeName>[\s\S]*?<\/Author>/g);
    const authors: string[] = [];
    for (const match of authorMatches) {
      if (authors.length < 10) {
        authors.push(`${match[2]} ${match[1]}`); // First Last format
      }
    }
    const authorsStr = authors.length > 0 
      ? (authors.length === 10 ? authors.join(', ') + ' et al.' : authors.join(', '))
      : '';
    
    // Extract abstract
    const abstractMatch = xmlText.match(/<AbstractText[^>]*>(.*?)<\/AbstractText>/s);
    const abstract = abstractMatch ? abstractMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    
    // Extract DOI
    const doiMatch = xmlText.match(/<ArticleId[^>]*IdType="doi"[^>]*>([^<]+)<\/ArticleId>/);
    const doi = doiMatch ? doiMatch[1] : '';
    
    return {
      title,
      authors: authorsStr,
      abstract,
      doi,
    };
  } catch (err: any) {
    console.error('Error parsing PubMed XML:', err);
    return null;
  }
}

// Fetch metadata for Cell.com or ScienceDirect articles using PubMed API
async function fetchCellScienceDirectMetadata(url: string, retries = 2): Promise<any> {
  console.log(`========== CELL/SCIENCEDIRECT METADATA EXTRACTION ==========`);
  console.log(`URL: ${url}`);
  
  // Step 1: Extract PII
  const pii = extractPII(url);
  if (!pii) {
    console.error(`Could not extract PII from URL: ${url}`);
    return null;
  }
  console.log(`Extracted PII: ${pii}`);
  
  // Step 2: ESearch to find PMID
  const pmid = await pubmedESearch(pii, retries);
  if (!pmid) {
    console.error(`Could not find PMID for PII: ${pii}`);
    // Fallback to HTML scraping could go here
    return null;
  }
  console.log(`Found PMID: ${pmid}`);
  
  // Step 3: EFetch to get full metadata
  const metadata = await pubmedEFetch(pmid, retries);
  if (!metadata) {
    console.error(`Could not fetch metadata for PMID: ${pmid}`);
    return null;
  }
  
  console.log(`========== METADATA EXTRACTED SUCCESSFULLY ==========`);
  console.log(`Title: ${metadata.title?.substring(0, 100) || 'N/A'}...`);
  console.log(`Authors: ${metadata.authors?.substring(0, 100) || 'N/A'}...`);
  console.log(`Abstract length: ${metadata.abstract?.length || 0} chars`);
  console.log(`DOI: ${metadata.doi || 'N/A'}`);
  console.log(`=====================================================`);
  
  return metadata;
}

// Fetch metadata for Science.org articles using PubMed API
async function fetchScienceOrgMetadata(url: string, retries = 2): Promise<any> {
  // Step 1: Extract DOI
  const doi = extractScienceDOI(url);
  if (!doi) {
    console.error(`Could not extract DOI from Science.org URL: ${url}`);
    return null;
  }

  // Step 2: Search PubMed using DOI
  const pmid = await pubmedESearchByDoi(doi, retries);
  if (!pmid) {
    console.error(`Could not find PMID for Science.org DOI: ${doi}`);
    return null;
  }

  // Step 3: EFetch to get full metadata
  const metadata = await pubmedEFetch(pmid, retries);
  if (!metadata) {
    console.error(`Could not fetch metadata for PMID: ${pmid}`);
    return null;
  }

  return metadata;
}

async function fetchRxivMetadata(server: RxivServer, doi: string, originalUrl: string, retries = 2): Promise<any> {
  // Direct API call (no proxy needed on Railway/Render)
  const apiUrl = `https://api.${server}.org/details/${server}/${doi}/na/json`;
  
  console.log(`========== API CALL DETAILS ==========`);
  console.log(`Server: ${server}`);
  console.log(`Extracted DOI: ${doi}`);
  console.log(`Original URL: ${originalUrl}`);
  console.log(`API URL: ${apiUrl}`);
  console.log(`=======================================`);
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    console.log(`========== API ATTEMPT ${attempt + 1}/${retries + 1} ==========`);
    try {
      const startTime = Date.now();
      console.log(`Calling API: ${apiUrl}`);

      const resp = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'bioRxiv-Preview-Bot/1.0',
          'Accept': 'application/json',
        },
      });
      
      if (!resp.ok) {
        console.error(`API error: ${resp.status}`);
        if (resp.status >= 500 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Server error, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        const errorText = await resp.text();
        console.error(`API error response: ${errorText.substring(0, 500)}`);
        return null;
      }

      console.log(`Parsing JSON response...`);
      const json: any = await resp.json();
      console.log(`JSON parsed successfully`);
      
      const collection = json?.collection;
      if (!Array.isArray(collection) || collection.length === 0) {
        console.error(`No collection in API response`);
        return null;
      }

      const entry = collection[0];
      const metadata = {
        title: (entry.title || '').trim(),
        authors: (entry.authors || '').trim(),
        abstract: (entry.abstract || '').trim(),
        date: entry.date,
        category: entry.category,
        version: entry.version,
      };

      console.log(`========== METADATA EXTRACTED SUCCESSFULLY ==========`);
      console.log(`Title: ${metadata.title?.substring(0, 100) || 'N/A'}...`);
      console.log(`Authors: ${metadata.authors?.substring(0, 100) || 'N/A'}...`);
      console.log(`Abstract length: ${metadata.abstract?.length || 0} chars`);
      console.log(`Date: ${metadata.date || 'N/A'}`);
      console.log(`Category: ${metadata.category || 'N/A'}`);
      console.log(`Version: ${metadata.version || 'N/A'}`);
      console.log(`=====================================================`);
      
      return metadata;
    } catch (err: any) {
      const isTimeout = err.message?.includes('timeout');
      const isNetworkError = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
      
      console.error(`========== API CALL FAILED ==========`);
      console.error(`Attempt: ${attempt + 1}/${retries + 1}`);
      console.error(`Exception type: ${err.name || err.type || 'Unknown'}`);
      console.error(`Exception message: ${err.message || 'No message'}`);
      console.error(`Error code: ${err.code || 'N/A'}`);
      console.error(`Full error:`, err);
      console.error(`Exception stack:`, err instanceof Error ? err.stack : 'No stack trace');
      console.error(`=====================================`);
      
      if ((isTimeout || isNetworkError) && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Network error/timeout, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (attempt === retries) {
        console.log(`All retry attempts exhausted, returning null`);
        return null;
      }
    }
  }
  
  return null;
}

async function postToSlack(channel: string, url: string, meta: any, source: ArticleSource) {
  const title = meta.title || '(No title)';
  const authors = meta.authors || '(No authors listed)';
  let abstract = meta.abstract || '(No abstract)';

  const maxChars = 1200;
  if (abstract.length > maxChars) {
    abstract = abstract.slice(0, maxChars).trimEnd() + ' …';
  }

  let label: string;
  let emoji: string;
  if (source === 'biorxiv') {
    label = 'bioRxiv';
    emoji = ':microscope:';
  } else if (source === 'medrxiv') {
    label = 'medRxiv';
    emoji = ':microscope:';
  } else if (source === 'cell') {
    label = 'Cell';
    emoji = ':cell:';
  } else if (source === 'sciencedirect') {
    label = 'ScienceDirect';
    emoji = ':book:';
  } else if (source === 'science') {
    label = 'Science';
    emoji = ':book:';
  } else {
    label = 'Article';
    emoji = ':page_facing_up:';
  }

  const body = {
    channel,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${label} article detected* ${emoji}\n<${url}|*${title}*>`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Authors:* ${authors}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Abstract*\n${abstract}`,
        },
      },
    ],
  };

  console.log(`========== SLACK POST DETAILS ==========`);
  console.log(`Channel: ${channel}`);
  console.log(`Source: ${source}`);
  console.log(`Title: ${title.substring(0, 80)}...`);
  console.log(`Authors: ${authors.substring(0, 80)}...`);
  console.log(`Abstract length: ${abstract.length} chars`);
  console.log(`SLACK_BOT_TOKEN present: ${SLACK_BOT_TOKEN ? 'YES' : 'NO'}`);
  console.log(`Request body size: ${JSON.stringify(body).length} bytes`);
  console.log(`========================================`);
  
  console.log(`Sending POST request to Slack API...`);
  const startTime = Date.now();
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const fetchDuration = Date.now() - startTime;
  console.log(`Slack API request completed in ${fetchDuration}ms`);
  console.log(`Slack API response status: ${resp.status} ${resp.statusText}`);
  
  const data = await resp.json();
  console.log(`========== SLACK API RESPONSE ==========`);
  console.log(`Response OK: ${data.ok}`);
  console.log(`Full response:`, JSON.stringify(data, null, 2));
  console.log(`========================================`);
  
  if (!data.ok) {
    console.error('❌ Slack chat.postMessage error:', data);
    console.error(`Error code: ${data.error || 'Unknown error'}`);
    console.error(`Error description: ${data.error_description || 'N/A'}`);
    throw new Error(`Slack API error: ${data.error || 'Unknown error'}`);
  } else {
    console.log(`✅ Successfully posted message to Slack`);
    console.log(`Message timestamp: ${data.ts || 'N/A'}`);
    console.log(`Channel: ${data.channel || 'N/A'}`);
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      SLACK_SIGNING_SECRET: SLACK_SIGNING_SECRET ? 'SET' : 'MISSING',
      SLACK_BOT_TOKEN: SLACK_BOT_TOKEN ? 'SET' : 'MISSING',
      PAPERS_CHANNEL_ID: PAPERS_CHANNEL_ID || 'NOT SET',
    },
    message: 'bioRxiv Preview Bot is running',
  });
});

// Slack events endpoint
app.post('/api/slack-events', async (req, res) => {
  const requestId = `[${new Date().toISOString()}]`;
  console.log(`${requestId} ========== Handler called ==========`);
  console.log(`${requestId} Method: ${req.method}`);
  console.log(`${requestId} URL: ${req.url}`);
  console.log(`${requestId} Headers:`, {
    'x-slack-request-timestamp': req.headers['x-slack-request-timestamp'],
    'x-slack-signature': req.headers['x-slack-signature'] ? 'present' : 'missing',
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
  });

  const rawBody = req.body as Buffer;
  const rawBodyString = rawBody.toString('utf8');
  console.log(`${requestId} Raw body length: ${rawBodyString.length} chars`);
  console.log(`${requestId} Raw body preview (first 200 chars):`, rawBodyString.substring(0, 200));

  const signatureValid = verifySlackRequest(req, rawBody);
  console.log(`${requestId} Signature verification: ${signatureValid ? 'VALID' : 'INVALID'}`);
  
  if (!signatureValid) {
    console.error(`${requestId} Invalid Slack signature - rejecting request`);
    console.error(`${requestId} Environment check - SLACK_SIGNING_SECRET: ${SLACK_SIGNING_SECRET ? 'SET' : 'MISSING'}`);
    res.status(401).send('Invalid Slack signature');
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBodyString);
    console.log(`${requestId} Payload parsed successfully`);
    console.log(`${requestId} Payload type: ${payload.type}`);
    console.log(`${requestId} Full payload:`, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error(`${requestId} Failed to parse JSON:`, err);
    res.status(400).send('Invalid JSON');
    return;
  }

  // URL verification handshake
  if (payload.type === 'url_verification') {
    console.log(`${requestId} URL verification challenge received`);
    console.log(`${requestId} Challenge: ${payload.challenge}`);
    res.status(200).send(payload.challenge);
    return;
  }

  // Main event handler
  if (payload.type === 'event_callback') {
    console.log(`${requestId} Event callback received`);
    const event = payload.event;
    console.log(`${requestId} Event type: ${event?.type}`);
    console.log(`${requestId} Event details:`, JSON.stringify(event, null, 2));
    
    if (event?.type !== 'link_shared') {
      console.log(`${requestId} Received event type '${event?.type}' - not link_shared, ignoring`);
      res.status(200).send('OK');
      return;
    }
    
    if (event?.type === 'link_shared') {
      console.log(`${requestId} ========== LINK SHARED EVENT ==========`);
      const channel = event.channel as string;
      const links = event.links as { domain: string; url: string }[];
      const userId = event.user as string | undefined;
      const botId = event.bot_id as string | undefined;
      
      console.log(`${requestId} Channel: ${channel}`);
      console.log(`${requestId} User ID: ${userId || 'N/A'}`);
      console.log(`${requestId} Bot ID: ${botId || 'N/A'}`);
      console.log(`${requestId} Channel ID from env: ${PAPERS_CHANNEL_ID || 'NOT SET (all channels allowed)'}`);
      console.log(`${requestId} Number of links: ${links?.length || 0}`);
      console.log(`${requestId} Links:`, JSON.stringify(links, null, 2));

      // Prevent infinite loop: ignore links shared by bots (including ourselves)
      if (botId) {
        console.log(`${requestId} Link was shared by a bot (bot_id: ${botId}), ignoring to prevent loop`);
        res.status(200).send('Ignored (shared by bot)');
        return;
      }

      // Also check if it was shared by our bot user
      const botUserId = await getBotUserId();
      if (botUserId && userId === botUserId) {
        console.log(`${requestId} Link was shared by our bot (user_id: ${userId}), ignoring to prevent loop`);
        res.status(200).send('Ignored (shared by our bot)');
        return;
      }

      // Optional: restrict to #papers only
      if (PAPERS_CHANNEL_ID && channel !== PAPERS_CHANNEL_ID) {
        console.log(`${requestId} Channel mismatch - ignoring. Expected: ${PAPERS_CHANNEL_ID}, Got: ${channel}`);
        res.status(200).send('Ignored (different channel)');
        return;
      }

      // Fire-and-forget processing; respond quickly to Slack
      console.log(`${requestId} Sending OK response to Slack, processing links asynchronously...`);
      res.status(200).send('OK');

      if (!links || links.length === 0) {
        console.log(`${requestId} No links found in event`);
        return;
      }

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        console.log(`${requestId} Processing link ${i + 1}/${links.length}`);
        const domain = link.domain;
        const url = link.url;
        
        console.log(`${requestId} Link domain: ${domain}`);
        console.log(`${requestId} Link URL: ${url}`);

        let source: ArticleSource | null = null;
        if (domain === 'biorxiv.org' || url.includes('biorxiv.org')) {
          source = 'biorxiv';
        } else if (domain === 'medrxiv.org' || url.includes('medrxiv.org')) {
          source = 'medrxiv';
        } else if (domain === 'cell.com' || url.includes('cell.com')) {
          source = 'cell';
        } else if (domain === 'sciencedirect.com' || url.includes('sciencedirect.com')) {
          source = 'sciencedirect';
        } else if (domain === 'science.org' || url.includes('science.org')) {
          source = 'science';
        }

        console.log(`${requestId} Detected source: ${source || 'NONE'}`);

        if (!source) {
          console.log(`${requestId} Not a supported link (bioRxiv/medRxiv/Cell/ScienceDirect/Science), skipping`);
          continue;
        }

        try {
          let meta: any = null;
          
          if (source === 'biorxiv' || source === 'medrxiv') {
            // Handle bioRxiv/medRxiv
            const doi = extractDoi(url);
            console.log(`${requestId} ========== DOI EXTRACTION ==========`);
            console.log(`${requestId} Original URL: ${url}`);
            console.log(`${requestId} Extracted DOI: ${doi || 'NONE'}`);
            console.log(`${requestId} =====================================`);
            if (!doi) {
              console.log(`${requestId} Could not extract DOI from URL: ${url}`);
              continue;
            }
            
            console.log(`${requestId} Fetching metadata for ${source} DOI: ${doi}`);
            meta = await fetchRxivMetadata(source, doi, url);
          } else if (source === 'cell' || source === 'sciencedirect') {
            // Handle Cell.com and ScienceDirect using PubMed API (PII-based)
            console.log(`${requestId} Fetching metadata for ${source} using PubMed API`);
            meta = await fetchCellScienceDirectMetadata(url);
          } else if (source === 'science') {
            // Handle Science.org using PubMed API (DOI-based)
            console.log(`${requestId} Fetching metadata for ${source} using PubMed API`);
            meta = await fetchScienceOrgMetadata(url);
          }
          
          if (!meta) {
            console.log(`${requestId} No metadata returned for ${source} link: ${url}`);
            continue;
          }
          
          console.log(`${requestId} ========== METADATA RETRIEVED ==========`);
          console.log(`${requestId} Title: ${meta.title?.substring(0, 100)}...`);
          console.log(`${requestId} Authors: ${meta.authors?.substring(0, 100)}...`);
          console.log(`${requestId} Has abstract: ${!!meta.abstract} (length: ${meta.abstract?.length || 0})`);
          console.log(`${requestId} =========================================`);
          
          console.log(`${requestId} ========== POSTING TO SLACK ==========`);
          console.log(`${requestId} Channel: ${channel}`);
          console.log(`${requestId} URL: ${url}`);
          console.log(`${requestId} Source: ${source}`);
          try {
            await postToSlack(channel, url, meta, source);
            console.log(`${requestId} ✅ Successfully posted preview to Slack`);
          } catch (slackErr) {
            console.error(`${requestId} ❌ Error posting to Slack:`, slackErr);
            console.error(`${requestId} Error stack:`, slackErr instanceof Error ? slackErr.stack : 'No stack trace');
          }
          console.log(`${requestId} ======================================`);
        } catch (err) {
          console.error(`${requestId} Error handling ${source} link ${url}:`, err);
          console.error(`${requestId} Error stack:`, err instanceof Error ? err.stack : 'No stack trace');
        }
      }

      console.log(`${requestId} ========== Finished processing link_shared event ==========`);
      return;
    }
  }

  // Default fallthrough
  console.log(`${requestId} Default fallthrough - returning OK`);
  res.status(200).send('OK');
});

// Test fetch endpoint
app.get('/api/test-fetch', async (req, res) => {
  const requestId = `[${new Date().toISOString()}]`;
  console.log(`${requestId} ========== Test Fetch Handler Called ==========`);
  
  const testUrl = (req.query.url as string) || 'https://www.biorxiv.org/content/10.1101/2025.05.12.653376v2';
  
  const logs: string[] = [];
  const log = (msg: string) => {
    const logMsg = `${new Date().toISOString()}: ${msg}`;
    console.log(logMsg);
    logs.push(logMsg);
  };

  log('='.repeat(60));
  log('TESTING bioRxiv API CALL');
  log('='.repeat(60));
  log(`Original URL: ${testUrl}`);

  let startTime: number = 0;

  try {
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

    let server = 'biorxiv';
    if (testUrl.includes('medrxiv.org')) {
      server = 'medrxiv';
    }

    const apiUrl = `https://api.${server}.org/details/${server}/${doi}/na/json`;
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
});

// Listen on :: (IPv6) for Railway compatibility, which binds to both IPv4 and IPv6
app.listen(PORT, '::', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment check:`);
  console.log(`  SLACK_SIGNING_SECRET: ${SLACK_SIGNING_SECRET ? 'SET' : 'MISSING'}`);
  console.log(`  SLACK_BOT_TOKEN: ${SLACK_BOT_TOKEN ? 'SET' : 'MISSING'}`);
  console.log(`  PAPERS_CHANNEL_ID: ${PAPERS_CHANNEL_ID || 'NOT SET'}`);
});

