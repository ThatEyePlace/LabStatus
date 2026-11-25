import { isOwner, privateJson } from '../../_security';
import { sendNotification } from '../_send';
export async function POST(request:Request) {
  if(!(await isOwner()))return privateJson({error:'Owner access required'},403);
  const body=await request.json().catch(()=>null);
  if(body?.recipient!=='glasses@thateyeplace.com'||body?.type!=='test'||!body?.subject?.startsWith('[LabStatus test]'))return privateJson({error:'Use the approved test mailbox and test subject prefix.'},400);
  return sendNotification(body,null);
}
