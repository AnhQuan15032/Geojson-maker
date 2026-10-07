import { kvGet, kvPut, kvDel, uuid, json, bad, getCookie, setCookie, deleteCookie } from './utils.js';

const SESSION_COOKIE = '__Host-session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30d

export async function getSessionUser(req, env) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const sess = await kvGet(env, 'SESSIONS', `sess:${token}`);
  if (!sess || !sess.userId) return null;
  const user = await kvGet(env, 'USERS', `user:${sess.userId}`);
  return user ? { ...user, _token: token } : null;
}

export async function createSession(env, user) {
  const token = uuid();
  await kvPut(env, 'SESSIONS', `sess:${token}`, { userId: user.id, createdAt: Date.now() }, { expirationTtl: SESSION_TTL });
  // also ensure user stored
  await kvPut(env, 'USERS', `user:${user.id}`, user);
  return token;
}

export function sessionCookie(token) {
  return setCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL, secure: true });
}

// OAuth helpers
function baseUrl(req, env) {
  if (env.BASE_URL) return env.BASE_URL.replace(/\/$/, '');
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export async function handleDiscordStart(req, env) {
  const clientId = env.DISCORD_CLIENT_ID;
  if (!clientId || !env.DISCORD_CLIENT_SECRET) {
    return handleMockLogin(req, env, 'discord');
  }
  const state = uuid();
  await kvPut(env, 'SESSIONS', `oauth:${state}`, { provider: 'discord', createdAt: Date.now() }, { expirationTtl: 600 });
  const redirect = `${baseUrl(req, env)}/api/auth/callback/discord`;
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify email');
  url.searchParams.set('state', state);
  return Response.redirect(url.toString(), 302);
}

async function handleMockLogin(req, env, provider) {
  const mockUser = {
    id: `${provider}_demo_${Math.floor(Math.random()*1e6)}`,
    provider,
    name: 'Discord Demo',
    email: `demo@${provider}.local`,
    avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    createdAt: Date.now(),
  };
  const token = await createSession(env, mockUser);
  const headers = new Headers();
  headers.set('Set-Cookie', sessionCookie(token));
  const u = new URL(req.url);
  const returnTo = u.searchParams.get('returnTo') || '/';
  headers.set('Location', returnTo);
  return new Response(null, { status: 302, headers });
}

export async function handleDiscordCallback(req, env) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return bad('missing code/state', 400);
  const stored = await kvGet(env, 'SESSIONS', `oauth:${state}`);
  if (!stored || stored.provider !== 'discord') return bad('invalid state', 400);
  await kvDel(env, 'SESSIONS', `oauth:${state}`);
  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  if (!clientId) return bad('not configured', 500);
  const redirect = `${baseUrl(req, env)}/api/auth/callback/discord`;
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirect, scope: 'identify email',
    }),
  });
  if (!tokenRes.ok) return bad('token exchange failed ' + await tokenRes.text(), 500);
  const tok = await tokenRes.json();
  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!meRes.ok) return bad('userinfo failed', 500);
  const me = await meRes.json();
  const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png';
  const user = {
    id: `discord_${me.id}`,
    provider: 'discord',
    name: me.global_name || me.username || 'Discord User',
    email: me.email || '',
    avatar,
    discriminator: me.discriminator,
    createdAt: Date.now(),
  };
  const token = await createSession(env, user);
  const headers = new Headers();
  headers.set('Set-Cookie', sessionCookie(token));
  headers.set('Location', '/');
  return new Response(null, { status: 302, headers });
}

export async function handleLogout(req, env) {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await kvDel(env, 'SESSIONS', `sess:${token}`);
  const headers = new Headers();
  headers.set('Set-Cookie', deleteCookie(SESSION_COOKIE));
  return json({ ok: true }, 200, Object.fromEntries(headers.entries()));
}
