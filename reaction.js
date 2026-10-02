(function(root){
 'use strict';
 // Expression sprites are cosmetic: this module never changes physics nodes,
 // collision filters, positions, score, spawn probabilities, or merging.
 function cropPart(atlas,box,trim=true){
  const [x,y,w,h]=box,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(atlas,x,y,w,h,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h),seen=new Uint8Array(w*h);let largest=[];
  for(let p=0;p<w*h;p++){if(seen[p]||d.data[p*4+3]<80)continue;const q=[p];seen[p]=1;for(let i=0;i<q.length;i++){const k=q[i],xx=k%w,yy=Math.floor(k/w);for(const n of [xx>0?k-1:-1,xx<w-1?k+1:-1,yy>0?k-w:-1,yy<h-1?k+w:-1])if(n>=0&&!seen[n]&&d.data[n*4+3]>=80){seen[n]=1;q.push(n);}}if(q.length>largest.length)largest=q;}
  const keep=new Uint8Array(w*h);let l=w,t=h,r=0,b=0;
  for(const k of largest){const xx=k%w,yy=Math.floor(k/w);l=Math.min(l,xx);t=Math.min(t,yy);r=Math.max(r,xx);b=Math.max(b,yy);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=xx+dx,ny=yy+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h)keep[ny*w+nx]=1;}}
  for(let p=0;p<w*h;p++)if(!keep[p])d.data[p*4+3]=0;ctx.putImageData(d,0,0);if(!trim)return c;
  const out=document.createElement('canvas');out.width=r-l+1;out.height=b-t+1;out.getContext('2d').drawImage(c,l,t,out.width,out.height,0,0,out.width,out.height);return out;
 }
 function sample(ps,u,v){const x=Math.max(0,Math.min(7.999,u*8)),y=Math.max(0,Math.min(9.999,v*10)),i=Math.floor(x),j=Math.floor(y),du=x-i,dv=y-j,a=j*9+i,b=a+1,c=a+9,d=c+1;
  const ids=du>=dv?[a,b,d]:[a,d,c],ws=du>=dv?[1-du,du-dv,dv]:[1-dv,du,dv-du];return {x:ids.reduce((s,k,n)=>s+ps[k].x*ws[n],0),y:ids.reduce((s,k,n)=>s+ps[k].y*ws[n],0)};
 }
 function pressure(f){const co=Math.cos(f.angle),si=Math.sin(f.angle);let lo=Infinity,hi=-Infinity,rlo=Infinity,rhi=-Infinity;
  for(const n of f.nodes){const y=-(n.position.x-f.position.x)*si+(n.position.y-f.position.y)*co;lo=Math.min(lo,y);hi=Math.max(hi,y);rlo=Math.min(rlo,n.rest.y);rhi=Math.max(rhi,n.rest.y);}
  return Math.max(0,Math.min(1,(.98-(hi-lo)/(rhi-rlo))/.13));
 }
 // Resting soft bodies recover their shape and sleep, so deformation alone
 // cannot report sustained pressure. Read the final particle contacts even
 // when both bodies sleep; ignore the floor and neighbours at the same height.
 function supportLoad(f,frogs){
  let load=0;const gap=.9,ownMass=f.nodes.reduce((sum,n)=>sum+n.mass,0);
  for(const upper of frogs){if(upper===f||upper.position.y>=f.position.y-2)continue;
   if(upper.bounds.max.x<f.bounds.min.x-gap||upper.bounds.min.x>f.bounds.max.x+gap||upper.bounds.max.y<f.bounds.min.y-gap||upper.bounds.min.y>f.bounds.max.y+gap)continue;
   let pressing=false;
   for(const a of f.nodes){if(pressing)break;for(const b of upper.nodes){const dx=b.position.x-a.position.x,dy=b.position.y-a.position.y,r=a.circleRadius+b.circleRadius+gap;
     // A downward contact normal transfers pressure to the lower frog.
     if(dy<-.18*Math.abs(dx)&&dy<-.2&&dx*dx+dy*dy<=r*r){pressing=true;break;}
   }}
   if(pressing){const mass=upper.nodes.reduce((sum,n)=>sum+n.mass,0);load+=mass/ownMass;}
  }
  return load>0?Math.min(1,.65+.35*Math.min(1,load/4)):0;
 }
 const BOXES=[[102,81,300,390],[443,63,692,388],[801,13,990,390],[1107,46,1385,389],[88,470,326,716],[401,414,698,722],[773,436,1049,722],[1093,519,1412,721],[91,744,319,1068],[429,748,669,1071],[783,755,1010,1071]];
 // Per-character anchors refer to the original atlas UVs, not a shared face.
 const FACES=[
  {eyes:[[.33,.12],[.66,.12]],mouth:[.5,.195],arms:[[.24,.47],[.76,.47]],scale:1},
  {eyes:[[.35,.224],[.60,.224]],mouth:[.475,.293],arms:[[.20,.50],[.70,.50]],scale:.80},
  {eyes:[[.42,.326],[.74,.326]],mouth:[.58,.40],arms:[[.26,.55],[.84,.55]],scale:.85},
  {eyes:[[.529,.245],[.75,.245]],mouth:[.64,.315],arms:[[.40,.52],[.90,.52]],scale:.72},
  {eyes:[[.31,.16],[.57,.16]],mouth:[.44,.25],arms:[[.22,.53],[.70,.53]],scale:.80},
  {eyes:[[.425,.17],[.65,.20]],mouth:[.54,.265],arms:[[.27,.43],[.73,.43]],scale:.78},
  {eyes:[[.326,.168],[.558,.168]],mouth:[.44,.245],arms:[[.22,.50],[.74,.50]],scale:.84},
  {eyes:[[.20,.33],[.39,.23]],mouth:[.30,.44],arms:[[.31,.62],[.63,.59]],scale:.64,angle:-.25},
  {eyes:[[.33,.198],[.63,.198]],mouth:[.48,.264],arms:[[.22,.50],[.79,.50]],scale:.88},
  {eyes:[[.35,.16],[.61,.16]],mouth:[.48,.27],arms:[[.24,.46],[.77,.46]],scale:.90},
  {eyes:[[.64,.12],[.88,.07]],mouth:[.75,.17],arms:[[.27,.50],[.74,.48]],scale:.78,angle:-.28}
 ];
 function tintPart(image,color,kind){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);const d=g.getImageData(0,0,c.width,c.height),rgb=color.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
  // Tint only the cream shaft. The olive hands and green pupil end stay intact.
  for(let p=0;p<c.width*c.height;p++){const x=p%c.width,i=p*4,r=d.data[i],gg=d.data[i+1],b=d.data[i+2];if(x>c.width*(kind==='arm'?.58:.78)||d.data[i+3]===0)continue;if(r>gg*.95&&b>gg*.54&&r+gg+b>420){const light=(r*.2126+gg*.7152+b*.0722)/225;for(let k=0;k<3;k++)d.data[i+k]=Math.min(255,rgb[k]*light);}}
  g.putImageData(d,0,0);return c;
 }
 class ReactionRenderer{
  constructor(sprites,jelly,onChange=()=>{}){this.sprites=sprites;this.jelly=jelly;this.onChange=onChange;this.ready=false;this.clock=0;}
  load(){const img=new Image();img.onload=()=>{try{const body=cropPart(img,[0,0,660,840]);this.arm=cropPart(img,[660,250,594,450]);this.eye=cropPart(img,[0,850,650,404]);this.tongue=cropPart(img,[660,800,594,454]);
    this.arms=this.sprites.map((s,i)=>i===0?this.arm:tintPart(this.arm,NaiwaPhysics.META[i][1],'arm'));this.eyes=this.sprites.map((s,i)=>i===0?this.eye:tintPart(this.eye,NaiwaPhysics.META[i][1],'eye'));
    const s=this.sprites[0],base=document.createElement('canvas');base.width=s.sourceWidth;base.height=s.sourceHeight;base.getContext('2d').drawImage(body,s.sourceWidth*.08,0,s.sourceWidth*.84,s.sourceHeight);
    this.jelly.setReactionImage(base,0);this.ready=true;this.onChange();
    const bodies=new Image();bodies.onload=()=>{try{for(let i=1;i<11;i++){const [l,t,r,b]=BOXES[i],base=cropPart(bodies,[l,t,r-l,b-t],false);this.jelly.setReactionImage(base,i);}this.onChange();}catch(e){console.warn('Other reaction art unavailable',e);}};bodies.onerror=()=>{};bodies.src='reaction-bodies.png';
   }catch(e){console.warn('Reaction art unavailable',e);}};img.onerror=()=>{};img.src='white-reaction-parts.png';}
  update(frogs,ms){this.clock+=ms;if(!this.ready||ms<=0)return;
   for(const f of frogs){if(!this.jelly.reactionImages?.[f.frog.level-1])continue;const r=f.reaction||(f.reaction={amount:0,blend:0,hold:0,side:1,loadGrace:0,loadAmount:0});
    const deformation=pressure(f),load=supportLoad(f,frogs);
    if(load>0){r.loadAmount=load;r.loadGrace=160;}else{r.loadGrace=Math.max(0,(r.loadGrace||0)-ms);if(r.loadGrace===0)r.loadAmount=0;}
    const target=Math.max(deformation,r.loadAmount||0);
    r.hold=Math.max(target,r.hold-ms/650);if(target>.12)r.side=f.position.x>200?-1:1;
    const goal=Math.max(target,r.hold),speed=goal>r.amount?25:7;r.amount+=(goal-r.amount)*(1-Math.exp(-speed*ms/1000));
    if(r.amount<.002)r.amount=0;r.blend=Math.min(1,r.amount*7);
   }
  }
  drawIcon(target,level){const s=this.sprites[level-1],base=this.jelly.reactionImages?.[level-1];if(!base)return false;
   const f={id:200+level,shape:s,frog:{level},angle:0,position:{x:0,y:0},nodes:s.soft.nodes.map(n=>({rest:n,position:{x:n.x,y:n.y}})),reaction:{amount:1,blend:1,side:1}};
   const ctx=target.getContext('2d'),overhead=s.width*(level===11?.32:.10),k=Math.min((target.width-14)/(s.width*1.9),(target.height-18)/(s.height+overhead)),origin=s.soft.vertices[0],cx=origin.x+s.width/2,cy=origin.y+s.height/2-overhead/2;
   ctx.clearRect(0,0,target.width,target.height);ctx.save();ctx.translate(target.width/2-k*cx,target.height/2-k*cy);ctx.scale(k,k);ctx.drawImage(base,origin.x,origin.y,s.width,s.height);this.draw(ctx,[f]);ctx.restore();return true;
  }
  piece(ctx,image,p,angle,w,h,flip=false,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);ctx.rotate(angle);if(flip)ctx.scale(-1,1);ctx.drawImage(image,0,-h*.5,w,h);ctx.restore();}
  draw(ctx,frogs){if(!this.ready)return;for(const f of frogs){if(!this.jelly.reactionImages?.[f.frog.level-1]||!f.reaction||f.reaction.amount<.002)continue;const index=f.frog.level-1,face=FACES[index],r=f.reaction,a=r.amount,alpha=r.blend,s=f.shape,ps=NaiwaJelly.positions(f),width=s.width*face.scale,phase=this.clock*.014+f.id,wiggle=Math.sin(phase)*a*.06;
    // Anchors follow the same deformed texture triangles as the face/body.
    for(const side of [-1,1]){const p=sample(ps,...face.arms[side<0?0:1]),length=width*(.16+.33*a),height=width*.26;this.piece(ctx,this.arms[index],p,f.angle+(side<0?-.08:.08)+wiggle,length,height,side<0,alpha);}
    const mouth=sample(ps,...face.mouth);ctx.save();ctx.globalAlpha=alpha;ctx.translate(mouth.x,mouth.y);ctx.rotate(f.angle+(face.angle||0));ctx.strokeStyle='#69543b';ctx.lineWidth=Math.max(.3,width*.015);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-width*.085,0);ctx.quadraticCurveTo(0,width*.018,width*.085,0);ctx.stroke();ctx.restore();
    for(const side of [-1,1]){const p=sample(ps,...face.eyes[side<0?0:1]),length=width*(.08+.49*a),height=width*(.17+.035*a);this.piece(ctx,this.eyes[index],p,f.angle+(face.angle||0)+(side<0?.28:-.28),length,height,side<0,alpha);}
    const tongue=sample(ps,face.mouth[0]+r.side*.07*face.scale,face.mouth[1]+.005),length=width*(.06+.38*a),height=length*this.tongue.height/this.tongue.width;
    // The tongue image's root is at its upper-left rather than centre-left.
    ctx.save();ctx.globalAlpha=alpha*a;ctx.translate(tongue.x,tongue.y);ctx.rotate(f.angle+(face.angle||0)+wiggle);if(r.side<0)ctx.scale(-1,1);ctx.drawImage(this.tongue,0,-height*.13,length,height);ctx.restore();
   }}
 }
 root.NaiwaReaction={ReactionRenderer,pressure,sample,supportLoad,FACES};if(typeof module!=='undefined'&&module.exports)module.exports=root.NaiwaReaction;
})(typeof window!=='undefined'?window:globalThis);
