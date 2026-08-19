const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const times = process.argv.slice(2).map(Number);
(async () => {
  const b = await chromium.launch({args:['--force-color-profile=srgb','--font-render-hinting=none','--hide-scrollbars']});
  const p = await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  await p.goto('file://'+path.join(__dirname,'scene.html')+'?render=1',{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(300);
  await p.evaluate(()=>{window.__a=document.getAnimations();window.__a.forEach(a=>{try{a.pause()}catch(e){}})});
  console.log('animaciones:', await p.evaluate(()=>window.__a.length));
  fs.mkdirSync('preview',{recursive:true});
  for (const t of times){
    await p.evaluate(async ms=>{window.__a.forEach(a=>{try{a.currentTime=ms}catch(e){}});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}, t*1000);
    await p.screenshot({path:`preview/t${String(t).replace('.','_')}.png`, animations:'allow'});
  }
  await b.close(); console.log('preview listo');
})();
