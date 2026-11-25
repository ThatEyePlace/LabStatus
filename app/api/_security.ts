import { env } from 'cloudflare:workers';
import { cookies, headers } from 'next/headers';
import { verifySession } from '../../lib/email.mjs';
export const runtime = () => env as unknown as Record<string,string>;
export async function isOwner() {return (await headers()).get('oai-authenticated-user-email')?.toLowerCase() === (runtime().LABSTATUS_OWNER_EMAIL || 'anthonyperezabo@gmail.com').toLowerCase();}
export async function staffAuthenticated() {return await isOwner() || await verifySession((await cookies()).get('labstatus_auth')?.value,runtime().SESSION_SECRET);}
export async function staffName() {return (await headers()).get('oai-authenticated-user-email') || 'Authorized staff';}
export function privateJson(data:unknown,status=200) {return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
