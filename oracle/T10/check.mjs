import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const ids = Array.from({length:8}, (_,i)=>`AC${i+1}`);
const reported = new Set();
function report(id, error) {
  if (reported.has(id)) return;
  reported.add(id);
  console.log(JSON.stringify(error ? {criterion:id,result:'fail',detail:String(error.message || error).slice(0,1600)} : {criterion:id,result:'pass'}));
}
const watchdog = setTimeout(()=>{for(const id of ids) report(id,'HARNESS: verifier exceeded its time budget');process.exit(0);},550000);
const assert = (v,m)=>{if(!v) throw new Error(m);};
const norm = s=>s.replace(/\s+/g,' ').trim();
const books = [
  {title:'The Hobbit',author:'J.R.R. Tolkien',year:'1937',query:'tolkien'},
  {title:'Dune',author:'Frank Herbert',year:'1965',query:'dune'},
  {title:'Animal Farm',author:'George Orwell',year:'1945',query:'orwell'}
];
let browser, owner, page, base, fixture, setupError;
const button=(p,n)=>p.getByRole('button',{name:n,exact:true});
const heading=p=>p.getByRole('heading',{name:'Books',exact:true,level:2});
const section=p=>heading(p).locator('xpath=ancestor::*[self::section or @role="region"][1]');
const items=p=>section(p).getByRole('listitem');
const select=p=>p.getByRole('combobox',{name:'Sort by',exact:true});
async function visible(l){await l.waitFor({state:'visible'});}
async function until(fn,msg){const end=Date.now()+12000;let last;do{try{if(await fn())return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,100));}while(Date.now()<end);throw new Error(msg+(last?`: ${last.message}`:''));}
async function goto(p,url){let r;try{r=await p.goto(new URL(url,base).href,{waitUntil:'domcontentloaded'});}catch(e){if(/ERR_CONNECTION|ERR_NAME_NOT_RESOLVED/.test(e.message))throw new Error(`HARNESS: preview unreachable: ${e.message}`);throw e;}assert(r && r.status()<400,`Error HTTP status at ${url}: ${r?.status()}`);return r;}
async function login(p){await goto(p,'/login');await p.getByLabel('Email',{exact:true}).fill('alice@example.test');await p.getByLabel('Password',{exact:true}).fill('Correct-Horse-1');await button(p,'Sign in').click();await p.waitForURL(u=>u.pathname==='/lists');await visible(button(p,'Sign out'));}
async function create(p,label){const name=`T10 ${label} ${randomUUID()}`;await goto(p,'/lists/new');await p.getByLabel('Name',{exact:true}).fill(name);await button(p,'Create list').click();await p.waitForURL(u=>/^\/lists\/[^/]+$/.test(u.pathname)&&u.pathname!=='/lists/new');await visible(p.getByRole('heading',{name,exact:true,level:1}));return {name,path:new URL(p.url()).pathname};}
async function add(p,b){await p.getByLabel('Search books',{exact:true}).fill(b.query);await button(p,'Search').click();const results=p.getByRole('listitem').filter({has:p.getByText(b.title,{exact:true})}).filter({has:button(p,'Add')});await visible(results);await results.getByRole('button',{name:'Add',exact:true}).click();await visible(section(p).getByText(b.title,{exact:true}));}
async function order(p,indices){await visible(heading(p));await until(async()=>await items(p).count()===indices.length,'Incorrect number of books');for(let i=0;i<indices.length;i++){const item=items(p).nth(i), b=books[indices[i]];await visible(item.getByText(b.title,{exact:true}));const txt=norm(await item.innerText());assert(txt.includes(b.author),`${b.title}: missing author ${b.author}`);assert(new RegExp(`\\b${b.year}\\b`).test(txt),`${b.title}: missing first publish year`);}}
async function selected(p,label){assert(await select(p).locator('option:checked').innerText()===label,`Expected selected option ${label}`);}
async function noErrors(p){for(const a of await p.getByRole('alert').all()){if(await a.isVisible())assert(!/error|invalid|unavailable|failed|failure|not found/i.test(await a.innerText()),'Visible error alert');}assert(!/internal server error|application error|something went wrong/i.test(await p.locator('body').innerText()),'Visible error message');}
async function share(p,path){await goto(p,path);await p.getByLabel('Link expires in',{exact:true}).selectOption({label:'7 days'});await button(p,'Create share link').click();const field=p.getByLabel('Share link',{exact:true});await until(async()=>/^https?:\/\//.test(await field.inputValue()),'Share link not produced');const url=new URL(await field.inputValue());assert(/^\/s\/[^/]+$/.test(url.pathname),'Invalid Share link route');return url.href;}
async function anonymous(fn){const ctx=await browser.newContext();const p=await ctx.newPage();p.setDefaultTimeout(12000);p.setDefaultNavigationTimeout(20000);try{await fn(p);}finally{await ctx.close();}}
async function before(a,b,msg){assert(await a.evaluate((el,other)=>!!(el.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING),await b.elementHandle()),msg);}
async function empty(p){await visible(section(p).getByText('This list has no books yet.',{exact:true}));assert(await items(p).count()===0,'Empty list has book items');await noErrors(p);}
async function readonly(p){for(const name of ['Sort','Edit','Delete list','Search','Add','Create share link'])for(const role of ['button','link'])assert(await p.getByRole(role,{name,exact:true}).count()===0,`Share page exposes ${name}`);assert(await select(p).count()===0,'Share exposes Sort by');assert(await p.getByLabel('Search books',{exact:true}).count()===0,'Share exposes Search books');}
try{
  base=process.argv[2];if(!base)throw new Error('HARNESS: missing baseURL');new URL(base);
  let chromium;try{({chromium}=await import('playwright'));browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});}catch(e){throw new Error(`HARNESS: browser dependency unavailable: ${e.message}`);}
  owner=await browser.newContext();page=await owner.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(20000);
  await login(page);fixture=await create(page,'fixture');for(const b of books)await add(page,b);
}catch(e){setupError=e;}
async function criterion(id,fn){try{if(setupError)throw setupError;await fn();report(id);}catch(e){report(id,e);}}
await criterion('AC1',async()=>{
  await goto(page,fixture.path);await order(page,[0,1,2]);await selected(page,'Date added');
  assert(JSON.stringify(await select(page).locator('option').allTextContents())===JSON.stringify(['Date added','Title','Author']),'Sort options differ');
  assert(await section(page).getByRole('combobox',{name:'Sort by',exact:true}).count()===1,'Sort by outside Books section');assert(await section(page).getByRole('button',{name:'Sort',exact:true}).count()===1,'Sort outside Books section');
  await before(heading(page),select(page),'Heading must precede select');await before(select(page),button(page,'Sort'),'Select must precede Sort');await before(button(page,'Sort'),items(page).first(),'Sort must precede first book');
});
await criterion('AC2',async()=>{
  await goto(page,fixture.path);await order(page,[0,1,2]);await visible(page.getByRole('region',{name:'Books',exact:true}));
  const session=await owner.newCDPSession(page);let nodes;try{({nodes}=await session.send('Accessibility.getFullAXTree'));}finally{await session.detach();}
  const map=new Map(nodes.map(n=>[n.nodeId,n]));const flat=[];function walk(n){if(!n)return;if(!n.ignored)flat.push(n);for(const id of n.childIds||[])walk(map.get(id));}walk(nodes.find(n=>!n.parentId));
  const role=n=>n.role?.value,name=n=>n.name?.value||'';const region=flat.filter(n=>role(n)==='region'&&name(n)==='Books');assert(region.length===1,'AX tree must have one Books region');
  const subtree=[];function descend(n){if(!n)return;if(!n.ignored)subtree.push(n);for(const id of n.childIds||[])descend(map.get(id));}descend(region[0]);
  const at=(r,n)=>subtree.findIndex(x=>role(x)===r&&name(x)===n);
  const h=at('heading','Books'),c=at('combobox','Sort by'),s=at('button','Sort'),l=subtree.findIndex(x=>role(x)==='list');assert(h>=0&&h<c&&c<s&&s<l,'AX order is not heading, Sort by, Sort, book list');
  let prev=l;for(const b of books){const i=subtree.findIndex(x=>name(x)===b.title);assert(i>prev,`AX book order wrong for ${b.title}`);prev=i;}
  const combo=flat.findIndex(x=>x.nodeId===subtree[c].nodeId);for(const b of books)assert(!flat.slice(0,combo).some(n=>name(n).includes(b.title)),`Book ${b.title} precedes Sort by in AX reading order`);
});
await criterion('AC3',async()=>{
  await goto(page,fixture.path);await visible(button(page,'Delete list'));await button(page,'Delete list').focus();
  for(const target of [select(page),button(page,'Sort'),page.getByRole('combobox',{name:'Link expires in',exact:true})]){await page.keyboard.press('Tab');assert(await target.evaluate(el=>el===document.activeElement),'Unexpected sequential Tab focus');}
  await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');assert(await select(page).evaluate(el=>el===document.activeElement),'Cannot return to Sort by');
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await selected(page,'Title');await page.keyboard.press('Tab');assert(await button(page,'Sort').evaluate(el=>el===document.activeElement),'Tab did not reach Sort');await page.keyboard.press('Enter');await page.waitForURL(u=>u.pathname===fixture.path&&u.search==='?sort=title');await selected(page,'Title');await order(page,[2,1,0]);
});
await criterion('AC4',async()=>{
  await goto(page,fixture.path);await select(page).selectOption({label:'Author'});await button(page,'Sort').click();await page.waitForURL(u=>u.pathname===fixture.path&&u.search==='?sort=author');await selected(page,'Author');await order(page,[1,2,0]);
  const r=await page.reload({waitUntil:'domcontentloaded'});assert(r?.status()<400,'Reload error status');assert(new URL(page.url()).pathname===fixture.path&&new URL(page.url()).search==='?sort=author','Author URL lost after reload');await selected(page,'Author');await order(page,[1,2,0]);
  for(const suffix of ['', '?sort=added','?sort=bogus']){await goto(page,fixture.path+suffix);await selected(page,'Date added');await order(page,[0,1,2]);await noErrors(page);}
  await button(page,'Sign out').click();await page.waitForURL(u=>u.pathname==='/');await login(page);await goto(page,fixture.path);await selected(page,'Date added');await order(page,[0,1,2]);await noErrors(page);
});
await criterion('AC5',async()=>{
  const url=await share(page,fixture.path);await goto(page,fixture.path);await order(page,[0,1,2]);const lists=section(page).getByRole('list');assert(await lists.count()===1,'Expected one book list');const ownerText=norm(await lists.innerText());
  const other=await create(page,'share isolation');const otherURL=await share(page,other.path);
  await anonymous(async p=>{for(const target of [url,`${url}?sort=title`]){await goto(p,target);await visible(p.getByRole('heading',{level:1,name:fixture.name,exact:true}));await order(p,[0,1,2]);await readonly(p);assert(!(await p.locator('body').innerText()).includes(other.name),'Share leaks other list');
    // innerText preserves structured-content boundaries; remove only the heading's rendered text.
    const full=await section(p).innerText(),h=await heading(p).innerText();assert(norm(full.replace(h,''))===ownerText,'Share Books section contains different or extra content');
  }await goto(p,otherURL);await visible(p.getByRole('heading',{level:1,name:other.name,exact:true}));await empty(p);assert(!(await p.locator('body').innerText()).includes(fixture.name),'Second share exposes first list');for(const b of books)assert(await section(p).getByText(b.title,{exact:true}).count()===0,'Second share leaks fixture books');});
});
await criterion('AC6',async()=>{
  const f=await create(page,'empty');for(const suffix of ['','?sort=author']){await goto(page,f.path+suffix);await empty(page);}
  await goto(page,f.path);await visible(page.getByRole('link',{name:'Edit',exact:true}));await visible(button(page,'Delete list'));await visible(page.getByLabel('Search books',{exact:true}));await visible(button(page,'Create share link'));
  const url=await share(page,f.path);await anonymous(async p=>{await goto(p,url);await visible(p.getByRole('heading',{name:f.name,exact:true,level:1}));await empty(p);});
  await page.getByRole('link',{name:'Edit',exact:true}).click();await page.waitForURL(u=>u.pathname===`${f.path}/edit`);const renamed=f.name+' renamed';await page.getByLabel('Name',{exact:true}).fill(renamed);await button(page,'Save').click();await page.waitForURL(u=>u.pathname===f.path);await visible(page.getByRole('heading',{name:renamed,exact:true,level:1}));await empty(page);
  await page.getByLabel('Search books',{exact:true}).fill('dune');await button(page,'Search').click();await visible(page.getByRole('listitem').filter({has:page.getByText('Dune',{exact:true})}).filter({has:button(page,'Add')}));await empty(page);
  await button(page,'Delete list').click();await page.waitForURL(u=>u.pathname==='/lists');assert(await page.getByRole('link',{name:renamed,exact:true}).count()===0,'Deleted empty list remains');const r=await page.goto(new URL(f.path,base).href);assert(r?.status()===404,'Deleted empty list still available');
});
await criterion('AC7',async()=>{
  for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});await goto(page,fixture.path+'?sort=title');await order(page,[2,1,0]);await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const h=await heading(page).boundingBox(),c=await select(page).boundingBox(),s=await button(page,'Sort').boundingBox();assert(h&&c&&s,'Heading or sort controls not displayed');assert(c.width>0&&c.height>0&&s.width>0&&s.height>0,'Zero-size sort controls');for(const b of [c,s])assert(b.y>=h.y+h.height,`Sort overlaps/above heading at ${width}`);
    for(const item of await items(page).all()){await visible(item);const b=await item.boundingBox();assert(b&&b.y>=Math.max(c.y+c.height,s.y+s.height),`Book overlaps/above sort at ${width}`);}
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth&&document.body.scrollWidth<=window.innerWidth),`Horizontal overflow at ${width}`);
  }
});
await criterion('AC8',async()=>{
  let axe;try{axe=await readFile('/node_modules/axe-core/axe.min.js','utf8');}catch(e){throw new Error(`HARNESS: not verified: pinned axe-core unavailable: ${e.message}`);}
  const failures=[];for(const width of [375,768,1280])for(const suffix of ['', '?sort=title']){await page.setViewportSize({width,height:900});await goto(page,fixture.path+suffix);await order(page,suffix?[2,1,0]:[0,1,2]);await page.addScriptTag({content:axe});const result=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));for(const v of result.violations.filter(v=>['serious','critical'].includes(v.impact)))failures.push({width,sort:suffix||'default',rule:v.id,targets:v.nodes.map(n=>n.target)});}
  assert(failures.length===0,`axe serious/critical violations: ${JSON.stringify(failures)}`);
});
try{await browser?.close();}catch{}clearTimeout(watchdog);process.exitCode=0;
