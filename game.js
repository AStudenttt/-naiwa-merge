(()=>{
 'use strict';
 const {$}= { $:s=>document.querySelector(s)};
 const canvas=$('#board'),ctx=canvas.getContext('2d'),stage=$('#game');
 const {GamePhysics,META,AREAS}=window.NaiwaPhysics;
 const bounds=[[102,81,300,390],[443,63,692,388],[801,13,990,390],[1107,46,1385,389],[88,470,326,716],[401,414,698,722],[773,436,1049,722],[1093,519,1412,721],[91,744,319,1068],[429,748,669,1071],[783,755,1010,1071]];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let galleryReaction=false,galleryCanvases=[];
 let sprites=[],physics=null,jelly=null,reaction=null,W=400,H=700,warningY=205,ratio=1,aim=200,current=1,next=1,paused=false,ready=false,last=0,acc=0,hasDropped=false,pointer=null,dragOrigin=null,fx=[],ripples=[],mergeCount=0,chainUntil=0,toastTimer=null,menuSource='menuPanel';
 let best=0;try{best=Number(localStorage.getItem('naiwa-best-v1'))||0}catch{}$('#best').textContent=best;
 const weighted=()=>{const n=Math.random();return n<.3?1:n<.56?2:n<.77?3:n<.92?4:5;};
 function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2300);}
 function makeSprite(atlas,box,i){
  const [l,t,r,b]=box,w=r-l,h=b-t,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(atlas,l,t,w,h,0,0,w,h);const data=g.getImageData(0,0,w,h),a=data.data,seen=new Uint8Array(w*h),components=[];
  // Discard isolated atlas speckles while retaining all substantial parts of the character.
  for(let p=0;p<w*h;p++){if(seen[p]||a[p*4+3]<80)continue;const q=[p];seen[p]=1;for(let k=0;k<q.length;k++){const v=q[k],x=v%w,y=Math.floor(v/w);for(const n of [x>0?v-1:-1,x<w-1?v+1:-1,y>0?v-w:-1,y<h-1?v+w:-1])if(n>=0&&!seen[n]&&a[n*4+3]>=80){seen[n]=1;q.push(n)}}components.push(q)}
  const max=Math.max(...components.map(c=>c.length)),keep=new Uint8Array(w*h);for(const comp of components)if(comp.length>=Math.max(150,max*.006))for(const p of comp)keep[p]=1;
  const edge=new Uint8Array(keep);for(let p=0;p<keep.length;p++)if(keep[p]){const x=p%w,y=Math.floor(p/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h)edge[ny*w+nx]=1;}}
  let area=0;for(let p=0;p<keep.length;p++){if(!edge[p])a[p*4+3]=0;if(keep[p])area++;}g.putImageData(data,0,0);
  const scale=Math.sqrt(AREAS[i]/area),soft=NaiwaJelly.buildSoftMesh(keep,w,h,scale);
  return {image:c,sourceWidth:w,sourceHeight:h,scale,width:w*scale,height:h*scale,soft};
 }
 function drawIcon(target,level){const g=target.getContext('2d'),s=sprites[level-1];g.clearRect(0,0,target.width,target.height);if(!s)return;const k=Math.min((target.width-20)/s.sourceWidth,(target.height-16)/s.sourceHeight);g.drawImage(s.image,(target.width-s.sourceWidth*k)/2,(target.height-s.sourceHeight*k)/2,s.sourceWidth*k,s.sourceHeight*k);}
 function buildGallery(){const grid=$('#galleryGrid');sprites.forEach((s,i)=>{const card=document.createElement('div');card.className='card';const num=document.createElement('span');num.className='level';num.textContent=String(i+1).padStart(2,'0');const c=document.createElement('canvas');c.width=180;c.height=190;drawIcon(c,i+1);galleryCanvases.push({canvas:c,level:i+1});const name=document.createElement('span');name.className='name';name.textContent=META[i][0];const score=document.createElement('span');score.className='points';score.textContent=i?`合成 +${2**i} 分`:'初始奶蛙';card.append(num,c,name,score);grid.append(card)});}
 function paintGalleryReaction(){for(const {canvas,level} of galleryCanvases){if(!galleryReaction||!reaction?.drawIcon(canvas,level))drawIcon(canvas,level);}$('#reactionPreview').textContent=galleryReaction?'查看原始形象':'查看受压形象';}
 function toggleGalleryReaction(){galleryReaction=!galleryReaction;paintGalleryReaction();}
 function updateBest(){if(physics.score>best){best=physics.score;$('#best').textContent=best;try{localStorage.setItem('naiwa-best-v1',String(best))}catch{}}}
 function onMerge(e){$('#score').textContent=e.score;updateBest();const now=performance.now();mergeCount=now<chainUntil?mergeCount+1:1;chainUntil=now+1100;fx.push({x:e.x,y:e.y,points:e.points,age:0,chain:mergeCount});ripples.push({x:e.x,y:e.y,age:0,color:META[e.level-1][1]});if(e.firstWin)toast('大奶蛙合成成功！继续挑战高分');}
 function onOver(score){updateBest();$('#finalScore').textContent=score;$('#finalBest').textContent=score>=best&&score>0?'这就是你的新纪录！':`历史最高 ${best} 分`;openPanel('overPanel');}
 function resize(){const rect=stage.getBoundingClientRect();ratio=rect.width/W;const newH=rect.height/ratio;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr*ratio,0,0,dpr*ratio,0,0);H=newH;const hud=document.querySelector('.hud');const hudBottom=hud?(hud.getBoundingClientRect().bottom-rect.top)/ratio:110;warningY=Math.max(205,hudBottom+Math.max(...sprites.slice(0,5).map(s=>s.height),79)+12);if(physics){physics.warning=warningY;physics.resize(H);}}
 function openPanel(id){if(!ready)return;paused=true;pointer=null;$('#modal').hidden=false;for(const p of $('#modal').children)p.hidden=p.id!==id;setTimeout(()=>$('#'+id).querySelector('button')?.focus(),0);}
 function closePanel(){if(physics?.over)return;paused=false;last=performance.now();acc=0;$('#modal').hidden=true;canvas.focus({preventScroll:true});}
 function restart(){physics.reset();fx=[];ripples=[];current=weighted();next=weighted();drawIcon($('#next'),next);$('#score').textContent=0;hasDropped=false;$('#hint').hidden=false;paused=false;pointer=null;mergeCount=0;chainUntil=0;last=performance.now();acc=0;$('#modal').hidden=true;}
 function drop(){if(!ready||paused||physics.over)return;const b=physics.drop(current,aim);if(!b)return;hasDropped=true;$('#hint').hidden=true;current=next;next=weighted();drawIcon($('#next'),next);}
 function setAim(clientX){const rect=canvas.getBoundingClientRect(),s=sprites[current-1];aim=Math.max(10+s.width/2,Math.min(W-10-s.width/2,(clientX-rect.left)/ratio));}
 canvas.addEventListener('pointerdown',e=>{if(!ready||paused||e.button>0)return;canvas.focus({preventScroll:true});if(e.pointerType==='mouse'){setAim(e.clientX);drop();return;}pointer=e.pointerId;dragOrigin=e.clientX;canvas.setPointerCapture(e.pointerId);setAim(e.clientX);});
 canvas.addEventListener('pointermove',e=>{if(!ready||paused)return;if(e.pointerType==='mouse'||e.pointerId===pointer)setAim(e.clientX)});
 canvas.addEventListener('pointerup',e=>{if(e.pointerId===pointer){setAim(e.clientX);pointer=null;drop()}});
 canvas.addEventListener('pointercancel',()=>{pointer=null});
 canvas.addEventListener('keydown',e=>{if(!ready)return;if(['ArrowLeft','ArrowRight',' ','Enter'].includes(e.key))e.preventDefault();if(paused)return;const s=sprites[current-1];if(e.key==='ArrowLeft')aim=Math.max(10+s.width/2,aim-15);if(e.key==='ArrowRight')aim=Math.min(W-10-s.width/2,aim+15);if((e.key===' '||e.key==='Enter')&&!e.repeat)drop();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ready){if($('#modal').hidden)openPanel(physics.over?'overPanel':'menuPanel');else if(!physics.over)closePanel();}if(e.key==='Tab'&&!$('#modal').hidden){const p=[...$('#modal').children].find(x=>!x.hidden);const list=[...p.querySelectorAll('button')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus();}}});
 const previewButton=$('#reactionPreview');if(previewButton)previewButton.onclick=toggleGalleryReaction;
 $('#menu').onclick=()=>openPanel(physics.over?'overPanel':'menuPanel');$('#resume').onclick=closePanel;$('#restart').onclick=()=>openPanel('confirmPanel');$('#cancelRestart').onclick=()=>openPanel('menuPanel');$('#confirmRestart').onclick=restart;$('#playAgain').onclick=restart;
 $('#galleryButton').onclick=()=>{menuSource='menuPanel';openPanel('galleryPanel')};$('#overGallery').onclick=()=>{menuSource='overPanel';openPanel('galleryPanel')};$('#galleryBack').onclick=()=>openPanel(menuSource);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready&&!paused&&!physics.over)openPanel('menuPanel');});
 new ResizeObserver(resize).observe(stage);
 function render(dt){
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff8e7';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#e8c78855';for(let y=190;y<H-10;y+=28)for(let x=20;x<W;x+=28){ctx.beginPath();ctx.arc(x,y,.65,0,Math.PI*2);ctx.fill();}
  const warning=physics.warning,danger=physics.danger(),color=danger?'#d85c38':'#d9b477';
  if(danger){ctx.fillStyle=`rgba(224,85,48,${.045+.025*Math.sin(performance.now()/140)})`;ctx.fillRect(0,warning,W,Math.min(55,H-warning));}
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(15,warning);ctx.lineTo(W-15,warning);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.font='600 12px sans-serif';ctx.textAlign='right';ctx.fillText(danger?`碰线 ${Math.max(0,(2000-danger)/1000).toFixed(1)}s`:'警戒线',W-18,warning-8);ctx.restore();
  // The container uses the full play surface; no footer or tools beneath it.
  ctx.strokeStyle='#d2a762';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(7,warning+12);ctx.lineTo(7,H-9);ctx.quadraticCurveTo(7,H-7,12,H-7);ctx.lineTo(W-12,H-7);ctx.quadraticCurveTo(W-7,H-7,W-7,H-12);ctx.lineTo(W-7,warning+12);ctx.stroke();
  const bodies=physics.frogs;reaction?.update(bodies,paused?0:dt);jelly.draw(ctx,bodies,W,H,canvas.width,canvas.height);reaction?.draw(ctx,bodies);
  if(!paused&&!physics.over){const s=sprites[current-1],x=Math.max(10+s.width/2,Math.min(W-10-s.width/2,aim)),y=warning-s.height/2-5;ctx.save();ctx.globalAlpha=physics.cooldown>0?.35:.85;ctx.drawImage(s.image,x-s.width/2,y-s.height/2,s.width,s.height);ctx.globalAlpha=.32;ctx.strokeStyle='#ae884e';ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(x,warning+8);ctx.lineTo(x,H-14);ctx.stroke();ctx.restore();}
  for(const r of ripples){if(!paused)r.age+=dt;const p=r.age/420;if(p>1)continue;ctx.save();ctx.globalAlpha=(1-p)*.6;ctx.strokeStyle=r.color;ctx.lineWidth=3*(1-p)+1;ctx.beginPath();ctx.arc(r.x,r.y,12+p*35,0,Math.PI*2);ctx.stroke();ctx.restore();}ripples=ripples.filter(r=>r.age<420);
  for(const f of fx){if(!paused)f.age+=dt;const p=f.age/1050;if(p>1)continue;ctx.save();ctx.globalAlpha=Math.min(1,(1-p)*2.5);ctx.textAlign='center';ctx.font='800 21px sans-serif';ctx.lineWidth=4;ctx.strokeStyle='#fff9e7';ctx.fillStyle='#d65e24';const y=f.y-10-(reduced?0:p*48);ctx.strokeText('+'+f.points,f.x,y);ctx.fillText('+'+f.points,f.x,y);if(f.chain>=2){ctx.font='700 11px sans-serif';ctx.fillStyle='#9f7433';ctx.fillText(`${f.chain} 连锁`,f.x,y+18);}ctx.restore();}fx=fx.filter(f=>f.age<1050);
 }
 function frame(now){const dt=Math.min(50,Math.max(0,now-last));last=now;if(ready){if(!paused){acc+=dt;let count=0;while(acc>=1000/60&&count++<4){physics.tick(1000/60);acc-=1000/60;}}render(dt);}requestAnimationFrame(frame);}
 const atlas=new Image();atlas.onload=()=>{try{sprites=bounds.map((b,i)=>makeSprite(atlas,b,i));jelly=new NaiwaJelly.JellyRenderer(sprites);reaction=new NaiwaReaction.ReactionRenderer(sprites,jelly,()=>{if(galleryReaction)paintGalleryReaction();});reaction.load();resize();physics=new GamePhysics({width:W,height:H,warning:warningY,shapes:sprites,onMerge,onOver});current=weighted();next=weighted();buildGallery();drawIcon($('#next'),next);$('#controlHint').textContent=matchMedia('(pointer:fine)').matches?'移动鼠标，点击落下 · 也可用方向键和空格':'左右拖动，松手落下';ready=true;$('#loading').hidden=true;$('#hint').hidden=false;last=performance.now();requestAnimationFrame(frame);}catch(e){console.error(e);$('#loading').innerHTML='<strong>奶蛙暂时没集合成功</strong><span>请刷新页面再试一次</span>';}};atlas.onerror=()=>{$('#loading').innerHTML='<strong>图片没有加载成功</strong><button class="primary" onclick="location.reload()">重新加载</button>';};atlas.src='naiwa-atlas.png';
 // Minimal deterministic access for automated rule verification; absent in ordinary play.
 if(new URLSearchParams(location.search).has('verify'))window.naiwaVerify={get physics(){return physics},get sprites(){return sprites},drop,openPanel,closePanel,restart,get paused(){return paused}};
})();

