import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import fetch from 'node-fetch';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const PAPERS_CHANNEL_ID = process.env.PAPERS_CHANNEL_ID; // optional

// Regex: 10.1101/YYYY.MM.DD.number (optionally followed by vN)
const DOI_RE = /(10\.1101\/\d{4}\.\d{2}\.\d{2}\.\d+)(?:v\d+)?/;

// Verify Slack signature
function verifySlackRequest(req: VercelRequest, rawBody: string): boolean {
  const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
  const slackSig = req.headers['x-slack-signature'] as string | undefined;

  if (!timestamp || !slackSig) return false;

  // Prevent replay attacks (>5 min old)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', SLACK_SIGNING_SECRET);
  hmac.update(sigBase);
  const mySig = `v0=${hmac.digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(slackSig));
  } catch {
    return false;
  }
}

function extractDoi(url: string): string | null {
  const m = DOI_RE.exec(url);
  if (!m) return null;
  return m[1]; // without the version suffix
}

type RxivServer = 'biorxiv' | 'medrxiv';

async function fetchRxivMetadata(server: RxivServer, doi: string) {
  const apiUrl = `https://api.${server}.org/details/${server}/${encodeURIComponent(doi)}/na/json`;
  const resp = await fetch(apiUrl, { timeout: 10000 as any });

  if (!resp.ok) {
    console.error(`Rxiv API error for ${server}, DOI ${doi}: ${resp.status}`);
    return null;
  }

  const json: any = await resp.json();
  const collection = json?.collection;
  if (!Array.isArray(collection) || collection.length === 0) {
    return null;
  }

  const entry = collection[0];
  return {
    title: (entry.title || '').trim(),
    authors: (entry.authors || '').trim(),
    abstract: (entry.abstract || '').trim(),
    date: entry.date,
    category: entry.category,
    version: entry.version,
  };
}

async function postToSlack(channel: string, url: string, meta: any, server: RxivServer) {
  const title = meta.title || '(No title)';
  const authors = meta.authors || '(No authors listed)';
  let abstract = meta.abstract || '(No abstract)';

  const maxChars = 1200;
  if (abstract.length > maxChars) {
    abstract = abstract.slice(0, maxChars).trimEnd() + ' …';
  }

  const label = server === 'biorxiv' ? 'bioRxiv' : 'medRxiv';

  const body = {
    channel,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${label} preprint detected* :microscope:\n<${url}|*${title}*>`,
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

  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!data.ok) {
    console.error('Slack chat.postMessage error:', data);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Slack sends POST
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  // Collect raw body (needed for signature verification)
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (!verifySlackRequest(req, rawBody)) {
    res.status(401).send('Invalid Slack signature');
    return;
  }

  const payload = JSON.parse(rawBody);

  // URL verification handshake
  if (payload.type === 'url_verification') {
    res.status(200).send(payload.challenge);
    return;
  }

  // Main event handler
  if (payload.type === 'event_callback') {
    const event = payload.event;
    if (event?.type === 'link_shared') {
      const channel = event.channel as string;
      const links = event.links as { domain: string; url: string }[];

      // Optional: restrict to #papers only
      if (PAPERS_CHANNEL_ID && channel !== PAPERS_CHANNEL_ID) {
        res.status(200).send('Ignored (different channel)');
        return;
      }

      // Fire-and-forget processing; respond quickly to Slack
      res.status(200).send('OK');

      for (const link of links) {
        const domain = link.domain;
        const url = link.url;

        let server: RxivServer | null = null;
        if (domain === 'biorxiv.org') {
          server = 'biorxiv';
        } else if (domain === 'medrxiv.org') {
          server = 'medrxiv';
        } else if (url.includes('biorxiv.org')) {
          server = 'biorxiv';
        } else if (url.includes('medrxiv.org')) {
          server = 'medrxiv';
        }

        if (!server) continue;

        const doi = extractDoi(url);
        if (!doi) {
          console.log(`Could not extract DOI from URL: ${url}`);
          continue;
        }

        try {
          const meta = await fetchRxivMetadata(server, doi);
          if (!meta) {
            console.log(`No metadata for ${server} DOI ${doi}`);
            continue;
          }
          await postToSlack(channel, url, meta, server);
        } catch (err) {
          console.error(`Error handling ${server} link ${url}:`, err);
        }
      }

      return;
    }
  }

  // Default fallthrough
  res.status(200).send('OK');
}
