import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.argv[2].replace(/\/$/,''), origin=new URL(base).origin;
let browser; const contexts=[];
const norm=s=>s.replace(/\s+/g,' ').trim();
async function poll(fn,ms=10000){const end=Date.now()+ms;let error;do{try{return await fn();}catch(e){error=e;}await new Promise(r=>setTimeout(r,75));}while(Date.now()<end);throw error;}
async function actor(user='alice'){
 browser??=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext();contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(10000);
 await page.goto(base+(user?'/login':'/'));
 if(user){await page.getByLabel('Email',{exact:true}).fill(user+'@example.test');await page.getByLabel('Password',{exact:true}).fill(user==='alice'?'Correct-Horse-1':'Battery-Staple-2');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(base+'/lists');}
 return {context,page};
}
async function list(){const a=await actor(),name='T3 '+randomUUID();await a.page.goto(base+'/lists/new');await a.page.getByLabel('Name',{exact:true}).fill(name);await a.page.getByRole('button',{name:'Create list',exact:true}).click();await a.page.getByRole('heading',{name,exact:true,level:1}).waitFor();assert.match(new URL(a.page.url()).pathname,/^\/lists\/[^/]+$/);return {...a,url:a.page.url()};}
async function expected(){const r=await fetch('http://books:9100/search.json?q=dune&limit=10',{signal:AbortSignal.timeout(10000)});assert(r.ok);const j=await r.json();assert(j.docs?.length,'test double must supply books');return j.docs.slice(0,10);}
async function search(p,q){await p.getByLabel('Search books',{exact:true}).fill(q);await p.getByRole('button',{name:'Search',exact:true}).click();}
function results(p){return p.getByRole('region',{name:'Search results',exact:true}).or(p.getByRole('list',{name:'Search results',exact:true})).or(p.locator('[aria-label="Search results"]')).first();}
async function mapped(p,docs){const rows=results(p).getByRole('listitem');await poll(async()=>{assert.equal(await rows.count(),docs.length,'result count differs from API');for(let i=0;i<docs.length;i++){const row=rows.nth(i),d=docs[i],t=norm(await row.innerText());assert(await row.isVisible());if(d.title)assert(t.includes(norm(d.title)),`result ${i+1}: title or order wrong`);if(d.author_name?.length)assert(t.includes(norm(d.author_name[0])),`result ${i+1}: author missing`);if(d.first_publish_year!=null)assert(new RegExp(`\\b${d.first_publish_year}\\b`).test(t),`result ${i+1}: year missing`);assert(await row.getByRole('button',{name:'Add',exact:true}).isVisible(),`result ${i+1}: Add missing`);}});return rows;}
async function books(p){const h=p.getByRole('heading',{name:'Books',exact:true});await h.waitFor();const s=h.locator('xpath=ancestor::*[self::section or self::article or @role="region"][1]');return await s.count()?s:h.locator('..');}
async function entries(p,d,n){await poll(async()=>{const s=await books(p),rows=s.getByRole('listitem'),texts=(await rows.allInnerTexts()).map(norm);assert.equal(texts.filter(t=>t.includes(norm(d.title))&&(!d.author_name?.length||t.includes(norm(d.author_name[0])))).length,n,`Books must contain ${n} entries for ${d.title}`);if(n)assert(await rows.filter({hasText:d.title}).first().isVisible());});}
async function recover(p,docs){await search(p,'dune');await mapped(p,docs);}
async function failure(p,q,ms){const start=Date.now();await search(p,q);await p.getByRole('alert').filter({hasText:'Book search is unavailable'}).first().waitFor({timeout:Math.max(1,ms-(Date.now()-start))});assert(Date.now()-start<=ms,`${q}: alert exceeded ${ms} ms`);return Date.now()-start;}
async function replay(context,r,cookies){const theirs=await context.cookies(r.url),headers={...r.headers};for(const [k,v]of Object.entries(headers)){if(['cookie','host','content-length'].includes(k.toLowerCase())){delete headers[k];continue;}let decoded=v;try{decoded=decodeURIComponent(v);}catch{}const c=cookies.find(c=>c.value===v||c.value===decoded);if(c)headers[k]=theirs.find(t=>t.name===c.name)?.value??'';}await context.request.fetch(r.url,{method:r.method,headers,data:r.body??undefined,failOnStatusCode:false,maxRedirects:0,timeout:15000});}
const checks={
 AC1:async()=>{const docs=await expected(),a=await list();await recover(a.page,docs);},
 AC2:async()=>{const a=await list();await recover(a.page,await expected());await search(a.page,'zzzz-nothing');await a.page.getByText('No books found',{exact:true}).waitFor();assert.equal(await results(a.page).getByRole('listitem').count(),0,'empty search retained result items');},
 AC3:async()=>{const docs=await expected(),errors=[];for(const q of ['__error__','__malformed__'])try{const a=await list();await failure(a.page,q,6000);await recover(a.page,docs);}catch(e){errors.push(q+': '+e.message);}assert.equal(errors.length,0,errors.join('; '));},
 AC4:async()=>{const docs=await expected(),a=await list();let completed;const pending=new Set();a.page.on('request',r=>{if(new URL(r.url()).origin===origin&&!['GET','HEAD','OPTIONS'].includes(r.method()))pending.add(r);});const end=r=>{if(pending.has(r)&&completed===undefined)completed=Date.now();};a.page.on('requestfinished',end);a.page.on('requestfailed',end);const start=Date.now();await failure(a.page,'__timeout__',8000);const elapsed=(completed??Date.now())-start;assert(elapsed<=5000,`search give-up exceeded 5 s: ${elapsed} ms`);await recover(a.page,docs);},
 AC5:async()=>{const docs=await expected(),a=await list();await recover(a.page,docs);await results(a.page).getByRole('listitem').nth(0).getByRole('button',{name:'Add',exact:true}).click();await entries(a.page,docs[0],1);await a.page.reload();await entries(a.page,docs[0],1);await recover(a.page,docs);await results(a.page).getByRole('listitem').nth(0).getByRole('button',{name:'Add',exact:true}).click();await entries(a.page,docs[0],1);await a.page.reload();await entries(a.page,docs[0],1);},
 AC6:async()=>{const docs=await expected(),errors=[];for(const user of ['bob',null])try{
 const a=await list(),other=await actor(user);await recover(a.page,docs);const records=[],captures=[];
 const capture=r=>{if(new URL(r.url()).origin===origin&&!['GET','HEAD','OPTIONS'].includes(r.method()))captures.push((async()=>{records.push({method:r.method(),url:r.url(),body:r.postDataBuffer(),headers:await r.allHeaders()});})());};
 const cookies=await a.context.cookies();await a.page.route('**/*',async route=>{const r=route.request();if(new URL(r.url()).origin===origin&&!['GET','HEAD','OPTIONS'].includes(r.method()))await route.abort();else await route.continue();});a.page.on('request',capture);
 await results(a.page).getByRole('listitem').nth(0).getByRole('button',{name:'Add',exact:true}).click();await poll(async()=>assert(captures.length,'no add request captured'));await new Promise(r=>setTimeout(r,300));await Promise.all(captures);a.page.off('request',capture);await a.page.unroute('**/*');
 await a.page.goto(a.url);await entries(a.page,docs[0],0);for(const r of records)await replay(other.context,r,cookies);await a.page.reload();await entries(a.page,docs[0],0);
 // A positive control proves that the held-back request actually adds a book.
 for(const r of records)await replay(a.context,r,cookies);await a.page.reload();await entries(a.page,docs[0],1);
 }catch(e){errors.push((user??'anonymous')+': '+e.message);}assert.equal(errors.length,0,errors.join('; '));}
};
for(const [criterion,check]of Object.entries(checks)){try{await check();console.log(JSON.stringify({criterion,result:'pass'}));}catch(e){console.log(JSON.stringify({criterion,result:'fail',detail:String(e.message).slice(0,1000)}));}finally{await Promise.all(contexts.splice(0).map(c=>c.close().catch(()=>{})));}}
await browser?.close();process.exitCode=0;
