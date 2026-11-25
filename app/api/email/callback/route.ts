import { finishConnection, ORIGIN } from '../_outlook';
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  let result='connected';
  try {if(!params.get('code')||!params.get('state'))throw new Error('Microsoft connection was cancelled or denied.');await finishConnection(params.get('code')!,params.get('state')!);}catch(e){result=e instanceof Error?e.message:'Outlook connection failed.';}
  return new Response(null,{status:303,headers:{Location:`${ORIGIN}/?outlook=${encodeURIComponent(result)}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
