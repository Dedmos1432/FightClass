import type { Page,CDPSession } from '@playwright/test';

const sessions=new WeakMap<Page,CDPSession>();
/** Inspect responsive touch layouts on a desktop monitor; phone orientation has its own device tests. */
export async function desktopViewport(page:Page,size:{width:number;height:number}):Promise<void>{
  await page.setViewportSize(size);
  let session=sessions.get(page);
  if(!session){session=await page.context().newCDPSession(page);sessions.set(page,session);}
  // setViewportSize also resets emulated screen dimensions: restore the physical monitor explicitly.
  await session.send('Emulation.setDeviceMetricsOverride',{
    ...size,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:900,
    screenOrientation:{type:'landscapePrimary',angle:0},
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
}
