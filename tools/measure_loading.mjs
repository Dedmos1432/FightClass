import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Start a production preview first. Each run uses a fresh save and disabled HTTP cache.
const label=process.argv[2]??'optimized',base=process.argv[3]??'http://127.0.0.1:4174/FightClass/';
if(!/^[a-zA-Z0-9_-]+$/.test(label))throw new Error('Use a simple report label');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={label,base,network:{mbps:10,latencyMs:80,cache:false},stages:[]};
try{
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:10e6/8,uploadThroughput:10e6/8});
 let stage=null;const httpRequests=new Map();
 cdp.on('Network.requestWillBeSent',ev=>{if(ev.request.url.startsWith('http'))httpRequests.set(ev.requestId,ev.request.url);});
 cdp.on('Network.loadingFinished',ev=>{if(stage&&httpRequests.has(ev.requestId)){stage.requests++;stage.encodedBytes+=ev.encodedDataLength;}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function measure(name,action,ready){
  await page.evaluate(()=>performance.clearResourceTimings()).catch(()=>{});
  stage={name,requests:0,encodedBytes:0};const start=Date.now();
  await action();await ready();
  stage.ms=Date.now()-start;
  Object.assign(stage,await page.evaluate(()=>({resources:performance.getEntriesByType('resource').length,decodedBytes:performance.getEntriesByType('resource').reduce((s,r)=>s+r.decodedBodySize,0),jsHeapBytes:performance.memory?.usedJSHeapSize})));
  report.stages.push(stage);console.log(JSON.stringify(stage));stage=null;
 }
 const screen=name=>expect(page.locator('#ui')).toHaveAttribute('data-screen',name,{timeout:120000});
 async function walk(target){
  const p=page.locator('#world-focus');await expect(p).toHaveAttribute('data-player-x',/\d+/);
  for(let i=0;i<5;i++){
   const x=Number(await p.getAttribute('data-player-x'));if(Math.abs(x-target)<=75)break;
   const k=x<target?'d':'a';await page.keyboard.down(k);
   try{await expect.poll(async()=>Number(await p.getAttribute('data-player-x')),{intervals:[25],timeout:15000})[x<target?'toBeGreaterThanOrEqual':'toBeLessThanOrEqual'](target+(x<target?-55:55));}finally{await page.keyboard.up(k);}
   await expect(p).toHaveAttribute('data-animation',/idle/);
  }
 }
 await measure('cold-menu',()=>page.goto(base),()=>screen('menu'));
 await measure('new-tutorial',()=>page.locator('#start-game').click(),()=>screen('tutorial'));
 await measure('first-lobby',()=>page.locator('#tutorial-skip').click(),async()=>{await screen('lobby');await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);});
 await walk(457);
 await measure('first-gym',()=>page.keyboard.press('e'),async()=>{await screen('gym');await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);});
 await measure('return-lobby',()=>page.keyboard.press('Escape'),async()=>{await screen('lobby');await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);});
 await walk(1468);
 await measure('first-dojo',()=>page.keyboard.press('e'),async()=>{await screen('dojo');await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);});
 await walk(960);
 await measure('first-endless-fight',()=>page.keyboard.press('e'),async()=>{await screen('fight');await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting',{timeout:120000});});
 await page.keyboard.press('Escape');
 await measure('fight-return-lobby',()=>page.locator('#pause-exit').click(),async()=>{await screen('lobby');await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);});
 await walk(457);
 await measure('repeat-gym',()=>page.keyboard.press('e'),()=>screen('gym'));
 report.errors=errors;mkdirSync('artifacts',{recursive:true});writeFileSync(`artifacts/loading-${label}.json`,JSON.stringify(report,null,2));
 await context.close();
}finally{await browser.close();}
