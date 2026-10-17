/** Bounded deterministic AutoSkills context: no LLM summarization needed. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const VERSION = 1;
const KNOWN_ALIASES = { nextjs:['next.js'], node:['node.js'], dotnet:['.net','asp.net'],
  'react-native':['react native'], 'github-actions':['github actions'],
  'mcp-sdk':['model context protocol','mcp'], 'react-hook-form':['rhf'],
  shadcn:['shadcn/ui'], postgres:['postgresql'], go:['golang'], typescript:['type script'] };
const tidy = s => String(s || '').replace(/\x60/g, '').replace(/\s+/g, ' ').trim();
const clip = (s,n) => tidy(s).slice(0,n);
const unique = xs => [...new Set(xs.filter(Boolean))];
export function technologySignals(t) {
  const d = t.detect || {};
  return unique([t.id,t.name,...(KNOWN_ALIASES[t.id] || []),
    ...(d.packages || []),...(d.pythonPackages || []),...(d.gems || []),
    ...(d.configFiles || []),...(d.fileExtensions || [])]);
}
export function technologyQuestion(t) {
  const hints = technologySignals(t).filter(x => x !== t.name && x !== t.id).slice(0,3);
  return { type:'noul', instructions:
    `Is this agent skill specifically useful when ${t.name} (${t.id}) is detected?${hints.length ? ' Signals: '+hints.join(', ')+'.' : ''} Ignore incidental mentions.` };
}
function splitMetadata(md) {
  const match = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {body:md,tags:[]};
  const tags = [];
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(tags|keywords):\s*(.*)$/i);
    if (m) tags.push(...m[2].replace(/^\s*\[|\]\s*$/g,'').split(',')
      .map(x=>clip(x.replace(/^['"]|['"]$/g,''),35)));
  }
  return {body:md.slice(match[0].length),tags:unique(tags).slice(0,8)};
}
function sections(body) {
  const list = []; let item = {title:'Overview',text:''};
  for (const line of body.split(/\r?\n/)) {
    const head = line.match(/^#{1,3}\s+(.+?)\s*#*\s*$/);
    if (head) {if (item.text.trim()) list.push(item);item={title:clip(head[1],60),text:''};}
    else item.text += line+'\n';
  }
  if(item.text.trim()) list.push(item);
  return list;
}
const primary = /activation|when to use|use cases|prerequisite|purpose|overview|role|workflow|getting started|before anything/i;
function orderedSections(body) {
  return sections(body).map((item,i)=>({item,i})).sort((a,b)=>
    Number(!primary.test(a.item.title))-Number(!primary.test(b.item.title)) || a.i-b.i).map(x=>x.item);
}
export function buildSkillProfile(skill, markdown) {
  const {body,tags} = splitMetadata(markdown);
  const all = sections(body), ordered = orderedSections(body);
  const headings = unique(all.map(x=>x.title)
    .filter(x=>!/^(overview|examples|references|resources)$/i.test(x))).slice(0,7);
  const tools = unique([...body.matchAll(/\x60([^\x60\n]{2,32})\x60/g)].map(m=>m[1])
    .filter(x=>/^[\w@./:-]+(?: [\w@./:-]+)?$/.test(x))).slice(0,8);
  const activation = ordered.filter(x=>/activation|when to use|use cases|prerequisite|purpose/i.test(x.title))
    .map(x=>clip(x.text,160)).find(Boolean);
  const overview = ordered.filter(x=>/overview|role|about|getting started/i.test(x.title))
    .map(x=>clip(x.text,130)).find(Boolean);
  const parts = [
    `Agent skill: ${clip(skill.id,70)}`,
    `Purpose: ${clip(skill.description,320)}`,
    tags.length ? 'Tags: '+tags.join(', ') : '',
    activation ? 'When to use: '+activation : '',
    overview ? 'Overview: '+overview : '',
    headings.length ? 'Topics: '+headings.join(', ') : '',
    tools.length ? 'Tools: '+tools.join(', ') : ''
  ];
  let text='';
  for (const part of parts.filter(Boolean)) {
    if (text.length+part.length+1>850) {
      const remaining=850-text.length-1;
      if (remaining>36) text+=(text?'\n':'')+part.slice(0,remaining);
      break;
    }
    text+=(text?'\n':'')+part;
  }
  return {text,tags,headings,sourceChars:markdown.length,profileChars:text.length};
}
export async function cachedSkillProfile(skill, markdown, catalogPath) {
  const key=createHash('sha256').update(JSON.stringify([VERSION,skill.id,skill.description,markdown])).digest('hex');
  const file=resolve(dirname(resolve(catalogPath)),'.cache','laya','profiles',
    createHash('sha256').update(skill.id).digest('hex')+'.json');
  try {const found=JSON.parse(await readFile(file,'utf8'));
    if(found.key===key && found.profile?.text) return {...found.profile,cacheHit:true};
  } catch {/* miss */}
  const profile=buildSkillProfile(skill,markdown);
  await mkdir(dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';
  try {await writeFile(temp,JSON.stringify({key,profile},null,2)+'\n',{flag:'wx',mode:0o600});
    await rename(temp,file);
  } finally {await rm(temp,{force:true});}
  return {...profile,cacheHit:false};
}
export function selectedEvidence(markdown, tech, maxChars=700) {
  const {body}=splitMetadata(markdown), sectionsList=orderedSections(body);
  const signals=technologySignals(tech).map(x=>x.toLowerCase()).filter(x=>x.length>=3);
  const matches=sectionsList.map((item,i)=>{
    const hay=(item.title+' '+item.text).toLowerCase();
    const positions=signals.map(s=>hay.indexOf(s)).filter(p=>p>=0);
    return {item,i,position:positions.length?Math.min(...positions):-1,
      score:positions.length*10+Number(primary.test(item.title))*2};
  }).sort((a,b)=>b.score-a.score||a.i-b.i);
  const best=matches[0];
  if(!best)return '';
  const text=tidy(best.item.text), position=best.position<0?0:Math.max(0,best.position-best.item.title.length-1);
  const start=Math.max(0,Math.min(position-80,Math.max(0,text.length-maxChars)));
  return 'Section: '+best.item.title+'\n'+text.slice(start,start+maxChars);
}
export function isBorderline(p,threshold) {
  return p>=Math.max(0.5,threshold-0.14) && p<=Math.min(1,threshold+0.06);
}
