(function(root){
 'use strict';
 const M=typeof module!=='undefined'&&module.exports?require('./matter.min.js'):root.Matter;
 const {Engine,Bodies,Body,Composite,Sleeping}=M;
 const META=[['白奶蛙','#f2e9ce'],['鼠奶蛙','#f2a2bb'],['兔奶蛙','#82c9ef'],['鸡奶蛙','#f8a13e'],['狗奶蛙','#a9d69a'],['虎奶蛙','#b088dc'],['猴奶蛙','#f78176'],['猪奶蛙','#54c8cc'],['牛奶蛙','#6284d8'],['抱头大笑','#ed7899'],['大奶蛙','#ffd44f']];
 const AREAS=[440,660,960,1380,1980,2820,3970,5540,7700,11000,15700].map(a=>a*2.07);
 let sequence=1;
 class GamePhysics{
  constructor({width=400,height=700,warning=205,shapes,onMerge=()=>{},onOver=()=>{}}){
   Object.assign(this,{width,height,warning,shapes,onMerge,onOver});
   this.engine=Engine.create({enableSleeping:true});Object.assign(this.engine,{positionIterations:7,velocityIterations:6,constraintIterations:4});this.engine.gravity.y=1.05;
   this.clock=0;this.score=0;this.cooldown=0;this.over=false;this.pending=[];this.won=false;this.wallBodies=[];this.frogs=[];
   this.resize(height);
  }
  resize(height){const delta=height-this.height;this.height=height;for(const b of this.wallBodies)Composite.remove(this.engine.world,b);this.wallBodies=[Bodies.rectangle(-18,height/2,48,height*3,{isStatic:true,label:'left',friction:.55}),Bodies.rectangle(this.width+18,height/2,48,height*3,{isStatic:true,label:'right',friction:.55}),Bodies.rectangle(this.width/2,height+22,this.width+80,60,{isStatic:true,label:'floor',friction:.65})];Composite.add(this.engine.world,this.wallBodies);if(Math.abs(delta)>.01)for(const f of this.frogs){this.wake(f);for(const n of f.nodes){Body.translate(n,{x:0,y:delta});Body.setVelocity(n,{x:n.velocity.x,y:0});}f.frog.aboveFor=0;this.measure(f);}}
  make(level,x,y,options={}){
   const s=this.shapes[level-1],soft=s.soft;if(!soft)throw new Error('Soft mesh is required');
   const group=Body.nextGroup(true),co=Math.cos(options.angle||0),si=Math.sin(options.angle||0);
   const f={id:sequence++,nodes:[],links:[],position:{x,y},velocity:{x:0,y:0},angle:options.angle||0,isSleeping:false,quiet:0,contact:false,bounds:{min:{x,y},max:{x,y}},frog:{level,entered:!!options.entered,age:0,aboveFor:0,locked:false,pop:options.pop||0},shape:s};
   f.nodes=soft.nodes.map((p,i)=>{const n=Bodies.circle(x+co*p.x-si*p.y,y+si*p.x+co*p.y,p.r,{friction:.48,frictionStatic:.65,frictionAir:.026,restitution:.035,slop:.04,collisionFilter:{group},sleepThreshold:100000,label:'jelly-node'},10);Body.setInertia(n,Infinity);n.owner=f;n.rest=p;n.nodeIndex=i;Body.setMass(n,Math.sqrt(AREAS[level-1])*.08/soft.nodes.length);return n;});
   // XPBD uses compliant position constraints, with separate resistance to
   // length changes and area changes. Mass-normalized compliance avoids the
   // old size-dependent spring softness. Matter bodies only store particle
   // geometry/velocity; no competing Matter spring/contact solver is run.
   f.links=soft.edges.map(e=>({...e,lambda:0}));
   f.areas=(soft.areas||[]).map(a=>({...a,lambda:0,ns:a.ids.map(i=>f.nodes[i]),grads:[{x:0,y:0},{x:0,y:0},{x:0,y:0}],ws:[0,0,0]}));
   Composite.add(this.engine.world,f.nodes);this.frogs.push(f);this.measure(f);return f;
  }
  measure(f){let x=0,y=0,vx=0,vy=0;for(const n of f.nodes){x+=n.position.x;y+=n.position.y;vx+=n.velocity.x;vy+=n.velocity.y;}const count=f.nodes.length;x/=count;y/=count;f.position.x=x;f.position.y=y;f.velocity.x=vx/count;f.velocity.y=vy/count;
   let a=0,b=0,minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;for(const n of f.nodes){const px=n.position.x-x,py=n.position.y-y;a+=n.rest.x*px+n.rest.y*py;b+=n.rest.x*py-n.rest.y*px;minx=Math.min(minx,n.bounds.min.x);miny=Math.min(miny,n.bounds.min.y);maxx=Math.max(maxx,n.bounds.max.x);maxy=Math.max(maxy,n.bounds.max.y);}f.angle=Math.atan2(b,a);f.bounds.min={x:minx,y:miny};f.bounds.max={x:maxx,y:maxy};
  }
  wake(f){if(!f.isSleeping)return;f.isSleeping=false;f.quiet=0;for(const n of f.nodes)Sleeping.set(n,false);}
  remove(f){Composite.remove(this.engine.world,f.nodes);const i=this.frogs.indexOf(f);if(i>=0)this.frogs.splice(i,1);}
  drop(level,x){if(this.over||this.cooldown>0)return null;const s=this.shapes[level-1];x=Math.max(10+s.width/2,Math.min(this.width-10-s.width/2,x));const f=this.make(level,x,this.warning-s.height/2-5);for(const n of f.nodes)Body.setVelocity(n,{x:0,y:1.6});this.cooldown=500;return f;}
  mergePending(){const pending=this.pending;this.pending=[];for(const [a,b] of pending){if(!this.frogs.includes(a)||!this.frogs.includes(b))continue;const level=a.frog.level+1,s=this.shapes[level-1];this.measure(a);this.measure(b);let x=(a.position.x+b.position.x)/2,y=(a.position.y+b.position.y)/2;x=Math.max(10+s.width/2,Math.min(this.width-10-s.width/2,x));y=Math.min(this.height-12-s.height/2,y);const entered=a.frog.entered||b.frog.entered,vx=Math.max(-1.5,Math.min(1.5,(a.velocity.x+b.velocity.x)/2));this.remove(a);this.remove(b);const f=this.make(level,x,y,{entered,pop:1});for(const n of f.nodes)Body.setVelocity(n,{x:vx,y:Math.min(0,(a.velocity.y+b.velocity.y)/2)});const points=2**(level-1);this.score+=points;const firstWin=level===11&&!this.won;if(firstWin)this.won=true;this.onMerge({level,points,x,y,score:this.score,firstWin});}}
  weight(n){return n.isStatic||n.owner.isSleeping?0:n.inverseMass;}
  solveLengths(f,dt){
   for(const e of f.links){const a=f.nodes[e.a],b=f.nodes[e.b],wa=this.weight(a),wb=this.weight(b),dx=b.position.x-a.position.x,dy=b.position.y-a.position.y,l=Math.hypot(dx,dy);if(l<1e-8||wa+wb===0)continue;
    // Stretch compliance scales with rest length and inverse mass. Small
    // bodies have firmer material to survive their larger relative drop.
    const size=e.length/12,softness=e.stiffness<.1?2.5:1;
    const alpha=.000020*size*size*softness*(wa+wb)/(dt*dt),C=l-e.length;
    let dl=(-C-alpha*e.lambda)/(wa+wb+alpha);e.lambda+=dl;
    const nx=dx/l,ny=dy/l;a.position.x-=wa*nx*dl;a.position.y-=wa*ny*dl;b.position.x+=wb*nx*dl;b.position.y+=wb*ny*dl;
    // A safety envelope is independent of softness, so an impact cannot
    // stretch or crush a limb into a folded pile of particles.
    const next=l+(wa+wb)*dl,limit=Math.max(e.length*.76,Math.min(e.length*1.24,next));
    if(Math.abs(next-limit)>1e-6){dl=(limit-next)/(wa+wb);a.position.x-=wa*nx*dl;a.position.y-=wa*ny*dl;b.position.x+=wb*nx*dl;b.position.y+=wb*ny*dl;}
   }
  }
  solveAreas(f,dt){
   for(const t of f.areas){const [a,b,c]=t.ns,pa=a.position,pb=b.position,pc=c.position;
    const area=((pb.x-pa.x)*(pc.y-pa.y)-(pb.y-pa.y)*(pc.x-pa.x))*.5;
    const grads=t.grads,ns=t.ns,ws=t.ws;grads[0].x=(pb.y-pc.y)*.5;grads[0].y=(pc.x-pb.x)*.5;grads[1].x=(pc.y-pa.y)*.5;grads[1].y=(pa.x-pc.x)*.5;grads[2].x=(pa.y-pb.y)*.5;grads[2].y=(pb.x-pa.x)*.5;for(let i=0;i<3;i++)ws[i]=this.weight(ns[i]);
    let den=0;for(let i=0;i<3;i++)den+=ws[i]*(grads[i].x**2+grads[i].y**2);if(den<1e-9)continue;
    const alpha=.00000035*Math.abs(t.area)*(ws[0]+ws[1]+ws[2])/(dt*dt);
    const dl=(-(area-t.area)-alpha*t.lambda)/(den+alpha);t.lambda+=dl;
    for(let i=0;i<3;i++){ns[i].position.x+=ws[i]*grads[i].x*dl;ns[i].position.y+=ws[i]*grads[i].y*dl;}
    // Signed-area barrier: material cells must remain upright even under a
    // much larger character. Re-evaluate gradients after the XPBD correction.
    const next=((pb.x-pa.x)*(pc.y-pa.y)-(pb.y-pa.y)*(pc.x-pa.x))*.5;
    if(next/t.area<.85){const gs=grads;gs[0].x=(pb.y-pc.y)*.5;gs[0].y=(pc.x-pb.x)*.5;gs[1].x=(pc.y-pa.y)*.5;gs[1].y=(pa.x-pc.x)*.5;gs[2].x=(pa.y-pb.y)*.5;gs[2].y=(pb.x-pa.x)*.5;let d=0;for(let i=0;i<3;i++)d+=ws[i]*(gs[i].x**2+gs[i].y**2);if(d>1e-9){const correction=(t.area*.85-next)/d;for(let i=0;i<3;i++){ns[i].position.x+=ws[i]*gs[i].x*correction;ns[i].position.y+=ws[i]*gs[i].y*correction;}}}

   }
  }
  contacts(nodes){
   let radius=4;for(const n of nodes)radius=Math.max(radius,n.circleRadius);const cell=radius*2.05,grid=new Map();
   for(let i=0;i<nodes.length;i++){const n=nodes[i],x=Math.floor(n.position.x/cell),y=Math.floor(n.position.y/cell);n.hashX=x;n.hashY=y;n.order=i;const key=x+y*2048;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(n);}
   for(const a of nodes){if(a.owner.isSleeping)continue;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const bucket=grid.get(a.hashX+dx+(a.hashY+dy)*2048);if(!bucket)continue;for(const b of bucket){if((!b.owner.isSleeping&&b.order<=a.order)||a.owner===b.owner)continue;
      let px=b.position.x-a.position.x,py=b.position.y-a.position.y,r=a.circleRadius+b.circleRadius,d2=px*px+py*py;if(d2>=r*r)continue;
      const fa=a.owner,fb=b.owner;fa.contact=fb.contact=true;
      if(fa.isSleeping&&Math.hypot(b.velocity.x,b.velocity.y)>.16)this.wake(fa);
      if(fb.isSleeping&&Math.hypot(a.velocity.x,a.velocity.y)>.16)this.wake(fb);
      if(fa.frog.entered||fb.frog.entered)fa.frog.entered=fb.frog.entered=true;
      if(!fa.frog.locked&&!fb.frog.locked&&fa.frog.level===fb.frog.level&&fa.frog.level<11){fa.frog.locked=fb.frog.locked=true;this.pending.push([fa,fb]);}
      const wa=this.weight(a),wb=this.weight(b),sum=wa+wb;if(!sum)continue;
      const d=Math.sqrt(d2);if(d<1e-7){px=1;py=0;}else{px/=d;py/=d;}const pen=r-d;
      a.position.x-=px*pen*wa/sum;a.position.y-=py*pen*wa/sum;b.position.x+=px*pen*wb/sum;b.position.y+=py*pen*wb/sum;
      // Tangential positional friction damps sliding at a real contact.
      const tx=-py,ty=px,relative=(b.position.x-b.x0-a.position.x+a.x0)*tx+(b.position.y-b.y0-a.position.y+a.y0)*ty;
      const friction=Math.max(-pen*.35,Math.min(pen*.35,relative*.55));a.position.x+=tx*friction*wa/sum;a.position.y+=ty*friction*wa/sum;b.position.x-=tx*friction*wb/sum;b.position.y-=ty*friction*wb/sum;
   }}}
   const floor=this.height-8;
   for(const n of nodes){if(!this.weight(n))continue;const p=n.position,r=n.circleRadius;
    if(p.x<6+r){p.x=6+r;n.owner.contact=true;}else if(p.x>this.width-6-r){p.x=this.width-6-r;n.owner.contact=true;}
    if(p.y>floor-r){const depth=p.y-(floor-r);p.y=floor-r;n.owner.contact=true;n.owner.frog.entered=true;const slide=p.x-n.x0;p.x-=Math.max(-depth*.7,Math.min(depth*.7,slide*.85));}
   }
  }
  step(ms){
   const dt=ms/1000,ratio=ms/(1000/60),nodes=this.frogs.flatMap(f=>f.nodes);
   for(const f of this.frogs){this.measure(f);f.contact=false;
    for(const n of f.nodes){n.x0=n.position.x;n.y0=n.position.y;if(!this.weight(n))continue;const damping=Math.exp(-.45*dt);n.position.x+=n.velocity.x*ratio*damping;n.position.y+=n.velocity.y*ratio*damping+1050*dt*dt;}
    for(const e of f.links)e.lambda=0;for(const t of f.areas)t.lambda=0;
    if(!f.isSleeping){this.measure(f);const co=Math.cos(f.angle),si=Math.sin(f.angle),memory=1-Math.exp(-2*dt);
     for(const n of f.nodes)if(this.weight(n)){n.position.x+=(f.position.x+co*n.rest.x-si*n.rest.y-n.position.x)*memory;n.position.y+=(f.position.y+si*n.rest.x+co*n.rest.y-n.position.y)*memory;}
    }
   }
   for(let iter=0;iter<10;iter++){for(const f of this.frogs)if(!f.isSleeping){this.solveLengths(f,dt);this.solveAreas(f,dt);}this.contacts(nodes);}
   // Update stored geometry once, and derive velocity from the constrained
   // displacement. Internal damping leaves centre-of-mass motion intact.
   for(const f of this.frogs){let vx=0,vy=0;for(const n of f.nodes){vx+=(n.position.x-n.x0)/ratio;vy+=(n.position.y-n.y0)/ratio;}vx/=f.nodes.length;vy/=f.nodes.length;
    for(const n of f.nodes){const x=n.position.x,y=n.position.y;n.position.x=n.x0;n.position.y=n.y0;Body.setPosition(n,{x,y});if(!this.weight(n))continue;
     Body.setVelocity(n,{x:vx+((x-n.x0)/ratio-vx)*.965,y:vy+((y-n.y0)/ratio-vy)*.965});}
    this.measure(f);if(f.isSleeping)continue;let travel=0;for(const n of f.nodes)travel=Math.max(travel,Math.hypot(n.position.x-n.x0,n.position.y-n.y0));f.travel=travel;
    if(f.contact&&travel<.055*ratio)f.quiet+=ms;else f.quiet=0;
    if(f.quiet>850){f.isSleeping=true;for(const n of f.nodes)Sleeping.set(n,true);}
   }
   this.mergePending();
  }
  tick(ms){if(this.over)return;this.clock+=ms;this.cooldown=Math.max(0,this.cooldown-ms);const substeps=Math.max(1,Math.ceil(ms/(1000/180)));for(let i=0;i<substeps;i++)this.step(ms/substeps);
   for(const f of this.frogs){const p=f.frog;p.age+=ms;p.pop=Math.max(0,p.pop-ms/320);if(f.bounds.min.y>this.warning+3)p.entered=true;if(p.entered&&f.bounds.min.y<this.warning){p.aboveFor+=ms;if(p.aboveFor>=2000){this.over=true;this.onOver(this.score);return;}}else p.aboveFor=0;}
  }
  danger(){let max=0;for(const f of this.frogs)max=Math.max(max,f.frog.aboveFor);return max;}
  reset(){for(const f of [...this.frogs])this.remove(f);this.pending=[];this.score=0;this.cooldown=0;this.over=false;this.won=false;this.clock=0;Engine.clear(this.engine);}
 }
 root.NaiwaPhysics={GamePhysics,META,AREAS};if(typeof module!=='undefined'&&module.exports)module.exports=root.NaiwaPhysics;
})(typeof window!=='undefined'?window:globalThis);
