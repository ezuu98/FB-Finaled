export async function GET(req: Request) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const url = `${API_BASE.replace(/\/$/, '')}/auth/me`;

  const auth = req.headers.get('authorization') || '';
  const upstream = await fetch(url, { cache: 'no-store', headers: auth ? { Authorization: auth } : undefined });
  const respText = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
  return new Response(respText, { status: upstream.status, headers: { 'Content-Type': contentType } });
}
