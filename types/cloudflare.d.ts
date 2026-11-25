interface D1Result<T = Record<string,unknown>> {results:T[];meta:{changes:number;last_row_id:number};success:boolean}
interface D1PreparedStatement {bind(...values:unknown[]):D1PreparedStatement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<D1Result<T>>;run():Promise<D1Result>}
interface D1Database {prepare(sql:string):D1PreparedStatement;batch<T=Record<string,unknown>>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>}
interface Fetcher {fetch(request:Request):Promise<Response>}
declare module 'cloudflare:workers' {export const env:{DB:D1Database;[key:string]:unknown};}
