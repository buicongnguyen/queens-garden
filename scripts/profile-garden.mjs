// Local-only benchmark: virtual modules and instrumentation never enter the shipped bundle.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const output = process.argv[2] || 'performance-artifacts';
const captureOnly = process.argv.includes('--capture-only');
await mkdir(output, { recursive: true });
const baseline = execFileSync('git', ['show', 'aebdde7:scripts/garden-renderer-entry.js'], {encoding:'utf8'});
const current = await readFile('scripts/garden-renderer-entry.js', 'utf8');
const hook = `
export function inspect(canvas) { return views.get(canvas); }
const originals = {};
const wrappers = {};
for (const name of ['compose','multiplyMatrices']) {
 const original = THREE.Matrix4.prototype[name];
 originals[name] = original;
 wrappers[name] = function(...args) {
  if (window.measure) window.measure[name]++;
  return original.apply(this,args);
 };
}
export function countMatrices(enabled) {
 for (const name of Object.keys(originals)) THREE.Matrix4.prototype[name] = enabled ? wrappers[name] : originals[name];
}`;
const modules = {};
for (const [name, source] of Object.entries({before:baseline, after:current})) {
  const result = await build({stdin:{contents:source+hook,resolveDir:process.cwd()+'/scripts',sourcefile:'profile-'+name+'.js'},
    bundle:true,format:'esm',write:false,minify:false});
  modules['/'+name+'.js'] = result.outputFiles[0].text;
}
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://local').pathname;
  if (modules[path]) { res.setHeader('Content-Type','text/javascript'); res.end(modules[path]); }
  else if (/^\/src\/[\w.-]+\.js$/.test(path)) {
    try { res.setHeader('Content-Type','text/javascript'); res.end(await readFile('.'+path)); }
    catch {res.writeHead(404);res.end();}
  } else {res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>canvas{display:block;width:min(720px,100%);height:auto}</style><canvas id="before"></canvas><canvas id="after"></canvas>');}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results = {};
try {
  for (const mobile of [false,true]) {
    const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},
      deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.buffers = new Map(); window.boundBuffers = new WeakMap();
      const proto = WebGL2RenderingContext.prototype;
      const originals={},wrappers={};
      for (const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','bufferData','bufferSubData','bindBuffer','deleteBuffer']) {
        const original = proto[name];
        originals[name]=original;
        wrappers[name] = function(...a) {
          const m=window.measure;
          if(name==='bindBuffer') {let map=window.boundBuffers.get(this);if(!map)window.boundBuffers.set(this,map=new Map());map.set(a[0],a[1]);}
          else if(name==='deleteBuffer') window.buffers.delete(a[0]);
          else if(name==='bufferData'||name==='bufferSubData') {
            const data=a[name==='bufferData'?1:2], start=a[3]||0;
            const length=a[4];
            const bytes=typeof data==='number'?data:(length || (data.length-start))*data.BYTES_PER_ELEMENT;
            if(m){m[name]++;m[name+'Bytes']+=bytes;}
            if(name==='bufferData')window.buffers.set(window.boundBuffers.get(this)?.get(a[0]),{canvas:this.canvas.id,bytes});
          } else if(m) {
            m.draws++;const inst=name.endsWith('Instanced'), arrays=name.startsWith('drawArrays');
            if(inst)m.instanced++; if(a[0]===4)m.triangles+=(arrays?a[2]:a[1])/3*(inst?(arrays?a[3]:a[4]):1);
          }
          return original.apply(this,a);
        };
      }
      window.countGL = enabled => {for(const name of Object.keys(originals)) proto[name]=enabled?wrappers[name]:originals[name];};
      window.countGL(true);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:mobile?4:1});
    const result=await page.evaluate(async (captureOnly) => {
      const {buildGardenScene}=await import('/src/garden-scene.js');
      const {createFixedLevelPuzzle,createEmptyBoard}=await import('/src/engine.js');
      const arms={before:await import('/before.js'),after:await import('/after.js')};
      const reset=()=>window.measure={draws:0,instanced:0,triangles:0,compose:0,multiplyMatrices:0,bufferData:0,bufferDataBytes:0,bufferSubData:0,bufferSubDataBytes:0};
      const out={};
      for(const n of captureOnly ? [15] : [7,15]) {
        window.countGL(true);for(const arm of Object.values(arms))arm.countMatrices(true);
        const puzzle=createFixedLevelPuzzle(n,1), board=createEmptyBoard(n);
        for(let i=0;i<n;i++)board[i][i]=1;
        const fixtures={};
        for(const name of ['before','after']) {
          const arm=arms[name],canvas=document.getElementById(name);
          const make=()=>buildGardenScene(puzzle,board,{compact:name==='after'});
          let data=make();arm.drawGarden(canvas,data,35);arm.drawGarden(canvas,data,35);
          reset();arm.drawGarden(canvas,data,45);const rotation={...window.measure};
          reset();arm.drawGarden(canvas,data,45);const unchanged={...window.measure};
          board[0][0]=2;reset();data=make();arm.drawGarden(canvas,data,45);const edit={...window.measure};board[0][0]=1;
          data=make();arm.drawGarden(canvas,data,35);
          const view=arm.inspect(canvas), gl=view.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
          fixtures[name]={rotation,unchanged,edit,geometryCount:view.renderer.info.memory.geometries,
            textureCount:view.renderer.info.memory.textures,programs:view.renderer.info.programs.length,
            bufferBytes:[...window.buffers.values()].filter(v=>v.canvas===name).reduce((s,v)=>s+v.bytes,0),
            gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',canvas:[canvas.width,canvas.height]};
          if(n===15 && !captureOnly) {
            fixtures[name].lifecycle=[];
            for(let i=0;i<3;i++) {
              arm.drawGarden(canvas,buildGardenScene({size:1,regions:[[0]]},[[1]],{compact:name==='after'}),35);
              arm.drawGarden(canvas,buildGardenScene(puzzle,createEmptyBoard(n),{compact:name==='after'}),35);
              arm.drawGarden(canvas,make(),35);
              fixtures[name].lifecycle.push({geometryCount:view.renderer.info.memory.geometries,
                programs:view.renderer.info.programs.length,bufferBytes:[...window.buffers.values()].filter(v=>v.canvas===name).reduce((s,v)=>s+v.bytes,0)});
            }
          }
        }
        // Timings are diagnostic only on software WebGL. Remove count wrappers in both arms.
        window.measure=null;
        window.countGL(false);for(const arm of Object.values(arms))arm.countMatrices(false);
        const timing={pairs:[],nullPairs:[]};
        const time=(name,angle)=>{const start=performance.now();arms[name].drawGarden(document.getElementById(name),arms[name].inspect(document.getElementById(name)).data,angle);return performance.now()-start;};
        for(let i=0;i<(captureOnly ? 0 : 12);i++) {
          const pair={};for(const name of i%2?['after','before']:['before','after'])pair[name]=time(name,50+i);
          timing.pairs.push(pair);timing.nullPairs.push([time('after',70+i),time('after',90+i)]);
          await new Promise(requestAnimationFrame);
        }
        for(const name of ['before','after'])arms[name].drawGarden(document.getElementById(name),arms[name].inspect(document.getElementById(name)).data,35);
        out[n]={...fixtures,timing};
      }
      window.countGL(true);for(const arm of Object.values(arms))arm.countMatrices(true);
      reset();await new Promise(r=>setTimeout(r,250));out.idle={...window.measure};window.measure=null;
      out.heap=performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null;
      return out;
    },captureOnly);
    if(!captureOnly) for(const size of [7,15]) {
      const a=result[size].after;
      if(a.rotation.draws>size+5 || a.edit.draws>2*(size+5)+1 || a.unchanged.draws!==0 ||
        a.rotation.bufferData+a.rotation.bufferSubData!==0 || a.edit.bufferDataBytes>100000 || a.bufferBytes>1100000)
        throw new Error(`Renderer work budget exceeded for ${size}x${size}`);
      for(const cycle of a.lifecycle||[]) if(cycle.geometryCount!==a.geometryCount || cycle.bufferBytes!==a.bufferBytes || cycle.programs!==a.programs)
        throw new Error(`Resources failed to return to baseline for ${size}x${size}`);
    }
    for(const name of ['before','after']) {
      // Identical CSS origin avoids fractional row offsets masquerading as image changes.
      await page.evaluate(name=>{
        for(const canvas of document.querySelectorAll('canvas')) canvas.style.display=canvas.id===name?'block':'none';
        window.scrollTo(0,0);
      },name);
      await page.locator('#'+name).screenshot({path:`${output}/${mobile?'mobile':'desktop'}-${name}.png`});
      await page.locator('#'+name).screenshot({path:`${output}/${mobile?'mobile':'desktop'}-${name}-control.png`});
    }
    results[mobile?'mobile':'desktop']=result;
    await context.close();
  }
  if(!captureOnly) await writeFile(output+'/measurements.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
