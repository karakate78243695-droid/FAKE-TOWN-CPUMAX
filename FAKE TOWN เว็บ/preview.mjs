import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './dist/server/index.js';
mkdirSync('.sites-runtime',{recursive:true});
const sqlite=new DatabaseSync('.sites-runtime/preview.sqlite');
sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS _preview_migrations (name TEXT PRIMARY KEY)');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){
 if(!sqlite.prepare('SELECT name FROM _preview_migrations WHERE name=?').get(name)){sqlite.exec(readFileSync('drizzle/'+name,'utf8'));sqlite.prepare('INSERT INTO _preview_migrations VALUES (?)').run(name)}
}
const bind=stmt=>({bind(...args){this.args=args;return this},args:[],async first(){return stmt.get(...this.args)||null},async all(){return {results:stmt.all(...this.args)}},async run(){return {meta:stmt.run(...this.args)}}});
const env={SITE_ORIGIN:'http://localhost:4173',DB:{prepare(sql){const obj=bind(sqlite.prepare(sql));obj.sql=sql;return obj},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}}};
if(existsSync('.dev.vars')){for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}}
createServer(async(req,res)=>{try{const parts=[];for await(const part of req)parts.push(part);const request=new Request('http://localhost:4173'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(e){console.error(e.message);res.writeHead(500);res.end('Preview unavailable')}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
