/**
 * Wikimedia Commons search — used by the Styles tab to find flag artwork and
 * apply it as an image fill.
 *
 * Everything goes through the public Commons API with `origin=*` (anonymous
 * CORS), so no key and no server proxy are needed.
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const USABLE_MIME = new Set([
  'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
]);

export function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function params(obj) {
  const qs = new URLSearchParams({ format: 'json', origin: '*', formatversion: '2' });
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  return qs.toString();
}

async function api(obj) {
  let response;
  try {
    response = await fetch(`${API}?${params(obj)}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Cannot reach Wikimedia Commons. Check your connection, or paste an image URL instead.');
  }
  if (!response.ok) throw new Error(`Wikimedia Commons answered ${response.status}.`);
  const data = await response.json();
  if (data && data.error) throw new Error(data.error.info || 'Commons search failed.');
  return data;
}

function meta(info) {
  const ext = (info && info.extmetadata) || {};
  const value = (k) => stripHtml(ext[k] && ext[k].value);
  return {
    author: value('Artist') || value('Credit'),
    license: value('LicenseShortName') || value('UsageTerms'),
    description: value('ImageDescription').slice(0, 220),
  };
}

/**
 * Search Commons files.
 * @returns {Promise<Array>} [{pageid,title,thumb,mime,width,height,author,license,pageUrl}]
 */
export async function searchFiles(query, { flagOnly = true, sort = 'relevance', limit = 30 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const search = flagOnly ? `flag ${q}` : q;
  const data = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: search,
    gsrnamespace: 6,
    gsrlimit: limit,
    gsrsort: sort === 'newest' ? 'create_timestamp_desc' : undefined,
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: 260,
  });

  const pages = (data.query && data.query.pages) || [];
  const items = [];
  for (const page of pages) {
    const info = (page.imageinfo && page.imageinfo[0]) || null;
    if (!info) continue;
    const mime = (info.mime || '').toLowerCase();
    if (!USABLE_MIME.has(mime)) continue;
    if (info.width && info.height && (info.width < 40 || info.height < 24)) continue;
    const { author, license, description } = meta(info);
    items.push({
      pageid: page.pageid,
      index: page.index ?? items.length,
      title: page.title,
      mime,
      width: info.width,
      height: info.height,
      thumb: info.thumburl || info.url,
      url: info.url,
      pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.title.replace(/^File:/, ''))}`,
      author,
      license,
      description,
    });
  }

  // Commons relevance is decent, but nudge exact "flag of X" files up front.
  const needle = q.toLowerCase().replace(/\s+/g, ' ');
  items.sort((a, b) => {
    const ta = a.title.toLowerCase();
    const tb = b.title.toLowerCase();
    const score = (t) => {
      let s = 0;
      if (t.includes(`flag of ${needle}`)) s -= 4;
      if (t.includes('flag')) s -= 2;
      if (t.includes(needle)) s -= 1;
      if (a.mime === 'image/svg+xml') s -= 0.5;
      return s;
    };
    const d = score(ta) - score(tb);
    return d !== 0 ? d : (a.index || 0) - (b.index || 0);
  });

  return items;
}

/**
 * Ask Commons for a render of `title` at a usable resolution (SVGs come back
 * as rasterised PNGs, which is what a canvas fill needs).
 */
export async function resolveFile(title, width = 1400) {
  const data = await api({
    action: 'query',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: width,
  });
  const pages = (data.query && data.query.pages) || [];
  const page = pages[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  if (!info) throw new Error(`Commons has no file data for “${title}”.`);
  const { author, license } = meta(info);

  const thumb = info.thumburl
    || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(title).replace(/^File:/, ''))}?width=${width}`;

  return {
    title,
    mime: (info.mime || '').toLowerCase(),
    width: info.width,
    height: info.height,
    url: info.url,
    thumb,
    author,
    license,
    pageUrl: info.descriptionurl,
    attribution: [author, license].filter(Boolean).join(' · ') || 'Wikimedia Commons',
  };
}

/** Turn any Commons page/file URL a user pastes into an API title. */
export function commonsTitleFromUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!/(^|\.)wikimedia\.org$/.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/wiki\/(?:File|Image):(.+)$/i)
      || url.pathname.match(/^\/wiki\/Special:FilePath\/(.+)$/i);
    if (m) return `File:${decodeURIComponent(m[1])}`;
    if (url.pathname.startsWith('/w/index.php')) {
      const title = url.searchParams.get('title');
      if (title) return /^File:/i.test(title) ? title : `File:${decodeURIComponent(title)}`;
    }
  } catch {
    return null;
  }
  return null;
}
