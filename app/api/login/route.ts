import { cookies } from "next/headers";
export async function POST(request:Request){const {pin}=await request.json() as {pin?:string};if(pin!=="4829")return Response.json({error:"Unauthorized"},{status:401});(await cookies()).set("labstatus_auth","authorized",{httpOnly:true,sameSite:"strict",secure:true,maxAge:43200,path:"/"});return Response.json({authenticated:true})}
