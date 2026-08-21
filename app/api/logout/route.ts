import { cookies } from "next/headers";
export async function POST(){(await cookies()).delete("labstatus_auth");return Response.json({authenticated:false})}
