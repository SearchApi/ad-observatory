import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

export function previewDatabase(path=':memory:'){
  const database=new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS preview_migrations (name TEXT PRIMARY KEY);');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){if(!database.prepare('SELECT name FROM preview_migrations WHERE name=?').get(name)){database.exec('BEGIN');try{database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));database.prepare('INSERT INTO preview_migrations (name) VALUES (?)').run(name);database.exec('COMMIT');}catch(error){database.exec('ROLLBACK');throw error;}}}
  const prepare=sql=>{
    const statement=database.prepare(sql);let values=[];
    return {bind(...args){values=args;return this;},async first(){return statement.get(...values)||null;},async run(){return statement.run(...values);},async all(){return {results:statement.all(...values)};}};
  };
  return {prepare,batch:statements=>Promise.all(statements.map(s=>s.run())),close:()=>database.close()};
}
