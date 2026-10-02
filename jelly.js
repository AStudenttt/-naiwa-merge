(function(root){
 'use strict';
 function buildSoftMesh(mask,w,h,scale){
  const width=w*scale,height=h*scale,aspect=width/height;
  const cols=Math.max(3,Math.round(6*Math.sqrt(aspect))),rows=Math.max(3,Math.round(6/Math.sqrt(aspect))),dx=width/cols,dy=height/rows;
  const nodes=[];
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
   let covered=0;for(let yy=0;yy<3;yy++)for(let xx=0;xx<3;xx++){const px=Math.min(w-1,Math.floor((i+(xx+.5)/3)*w/cols)),py=Math.min(h-1,Math.floor((j+(yy+.5)/3)*h/rows));if(mask[py*w+px])covered++;}
   if(covered>=3)nodes.push({x:(i+.5)*dx-width/2,y:(j+.5)*dy-height/2,r:Math.min(dx,dy)*.58,i,j});
  }
  const mx=nodes.reduce((sum,p)=>sum+p.x,0)/nodes.length,my=nodes.reduce((sum,p)=>sum+p.y,0)/nodes.length;for(const p of nodes){p.x-=mx;p.y-=my;}
  // Material triangles are separate from the dense texture mesh. Their signed
  // areas resist collapse; edge constraints allow shear and controlled stretch.
  const cells=new Map(nodes.map((p,k)=>[p.i+':'+p.j,k])),material=[];
  for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){
   const corners=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([x,y])=>cells.get(x+':'+y));
   const present=corners.filter(k=>k!==undefined);
   if(present.length===3)material.push(present);
   else if(present.length===4)material.push([corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]);
  }
  const areas=material.map(ids=>{const [a,b,c]=ids.map(k=>nodes[k]);return {ids,area:((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5};});
  const edges=[],seen=new Set();
  function add(a,b,stiffness){if(a>b)[a,b]=[b,a];const key=a+':'+b;if(seen.has(key))return;seen.add(key);const length=Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y);edges.push({a,b,length,stiffness});}
  for(let i=0;i<nodes.length;i++){
   const near=nodes.map((p,j)=>({j,d:Math.hypot(nodes[i].x-p.x,nodes[i].y-p.y)})).filter(p=>p.j!==i).sort((a,b)=>a.d-b.d);
   for(let k=0;k<near.length;k++){const n=near[k];if(k<3||n.d<Math.max(dx,dy)*1.55)add(i,n.j,.20);else if(k<6)add(i,n.j,.035);}
  }
  const vertices=[],triangles=[],meshCols=8,meshRows=10;
  for(let j=0;j<=meshRows;j++)for(let i=0;i<=meshCols;i++){
   const u=i/meshCols,v=j/meshRows,x=(u-.5)*width-mx,y=(v-.5)*height-my;
   const nearest=nodes.map((p,k)=>({k,d:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.d-b.d).slice(0,4);let sum=0;for(const n of nearest){n.weight=1/Math.max(1,n.d)**2.8;sum+=n.weight;}vertices.push({x,y,u,v,skin:nearest.map(n=>({k:n.k,w:n.weight/sum}))});
  }
  for(let j=0;j<meshRows;j++)for(let i=0;i<meshCols;i++){const a=j*(meshCols+1)+i,b=a+1,c=a+meshCols+1,d=c+1;triangles.push([a,b,d],[a,d,c]);}
  return {nodes,edges,vertices,triangles,areas};
 }
 function positions(f){const s=f.shape.soft,co=Math.cos(f.angle),si=Math.sin(f.angle),deviations=f.nodes.map(n=>({x:n.position.x-f.position.x-(co*n.rest.x-si*n.rest.y),y:n.position.y-f.position.y-(si*n.rest.x+co*n.rest.y)}));
  return s.vertices.map(p=>{let x=f.position.x+co*p.x-si*p.y,y=f.position.y+si*p.x+co*p.y;for(const k of p.skin){x+=deviations[k.k].x*k.w;y+=deviations[k.k].y*k.w;}return {x,y};});
 }
 class JellyRenderer{
  constructor(sprites){this.sprites=sprites;this.surface=document.createElement('canvas');let gl;try{gl=this.surface.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:false})}catch{}this.gl=gl;if(!gl)return;
   const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Jelly shader compilation failed');return s;};
   const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 a_pos;attribute vec2 a_uv;uniform vec2 u_size;varying vec2 v_uv;void main(){vec2 p=a_pos/u_size;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);v_uv=a_uv;}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D u_texture;uniform sampler2D u_reaction;uniform float u_blend;varying vec2 v_uv;void main(){gl_FragColor=mix(texture2D(u_texture,v_uv),texture2D(u_reaction,v_uv),u_blend);}'));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Jelly shader linking failed');this.program=program;this.pos=gl.getAttribLocation(program,'a_pos');this.uv=gl.getAttribLocation(program,'a_uv');this.size=gl.getUniformLocation(program,'u_size');this.blend=gl.getUniformLocation(program,'u_blend');this.reactionSampler=gl.getUniformLocation(program,'u_reaction');this.buffer=gl.createBuffer();this.textures=sprites.map(s=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,s.image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);this.surface.addEventListener('webglcontextlost',e=>{e.preventDefault();this.gl=null;});
  }
  setReactionImage(image,index=0){this.reactionImages||=[];this.reactionImages[index]=image;this.reactionFrames||=[];this.reactionFrames[index]=new Map();const gl=this.gl;if(!gl)return;this.reactionTextures||=[];gl.activeTexture(gl.TEXTURE0);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.reactionTextures[index]=t;}
  reactionFrame(index,blend){const cache=this.reactionFrames[index],key=Math.round(blend*16);if(cache.has(key))return cache.get(key);const image=this.reactionImages[index],c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.globalAlpha=1-key/16;g.drawImage(this.sprites[index].image,0,0);g.globalCompositeOperation='lighter';g.globalAlpha=key/16;g.drawImage(image,0,0);cache.set(key,c);if(cache.size>4)cache.delete(cache.keys().next().value);return c;}
  draw(ctx,frogs,W,H,pixelWidth,pixelHeight){const gl=this.gl;if(!gl){for(const f of frogs){const index=f.frog.level-1,blend=this.reactionImages?.[index]?(f.reaction?.blend||0):0;this.fallback(ctx,f,blend>0?this.reactionFrame(index,blend):f.shape.image);}return;}
   if(this.surface.width!==pixelWidth||this.surface.height!==pixelHeight){this.surface.width=pixelWidth;this.surface.height=pixelHeight;}gl.viewport(0,0,this.surface.width,this.surface.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.uniform2f(this.size,W,H);gl.uniform1i(this.reactionSampler,1);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(this.pos);gl.enableVertexAttribArray(this.uv);gl.vertexAttribPointer(this.pos,2,gl.FLOAT,false,16,0);gl.vertexAttribPointer(this.uv,2,gl.FLOAT,false,16,8);
   for(const f of frogs){const shape=f.shape.soft,ps=positions(f);const array=new Float32Array(shape.triangles.length*12);let k=0;for(const t of shape.triangles)for(const i of t){const p=ps[i],v=shape.vertices[i];array[k++]=p.x;array[k++]=p.y;array[k++]=v.u;array[k++]=v.v;}const index=f.frog.level-1,texture=this.reactionTextures?.[index],blend=texture?(f.reaction?.blend||0):0;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture||this.textures[index]);gl.activeTexture(gl.TEXTURE0);gl.bufferData(gl.ARRAY_BUFFER,array,gl.DYNAMIC_DRAW);gl.uniform1f(this.blend,blend);gl.bindTexture(gl.TEXTURE_2D,this.textures[f.frog.level-1]);gl.drawArrays(gl.TRIANGLES,0,array.length/4);}
   ctx.drawImage(this.surface,0,0,W,H);
  }
  fallback(ctx,f,image=f.shape.image){const s=f.shape,soft=s.soft,ps=positions(f);for(const ids of soft.triangles){const q=ids.map(i=>({x:soft.vertices[i].u*s.sourceWidth,y:soft.vertices[i].v*s.sourceHeight})),p=ids.map(i=>ps[i]);const det=(q[1].x-q[0].x)*(q[2].y-q[0].y)-(q[2].x-q[0].x)*(q[1].y-q[0].y);if(Math.abs(det)<1e-6)continue;const a=((p[1].x-p[0].x)*(q[2].y-q[0].y)-(p[2].x-p[0].x)*(q[1].y-q[0].y))/det,b=((p[1].y-p[0].y)*(q[2].y-q[0].y)-(p[2].y-p[0].y)*(q[1].y-q[0].y))/det,c=((q[1].x-q[0].x)*(p[2].x-p[0].x)-(q[2].x-q[0].x)*(p[1].x-p[0].x))/det,d=((q[1].x-q[0].x)*(p[2].y-p[0].y)-(q[2].x-q[0].x)*(p[1].y-p[0].y))/det;const cx=(p[0].x+p[1].x+p[2].x)/3,cy=(p[0].y+p[1].y+p[2].y)/3,clip=p.map(v=>{const dx=v.x-cx,dy=v.y-cy,d=Math.max(1,Math.hypot(dx,dy));return {x:v.x+dx/d*.55,y:v.y+dy/d*.55};});ctx.save();ctx.beginPath();ctx.moveTo(clip[0].x,clip[0].y);ctx.lineTo(clip[1].x,clip[1].y);ctx.lineTo(clip[2].x,clip[2].y);ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,p[0].x-a*q[0].x-c*q[0].y,p[0].y-b*q[0].x-d*q[0].y);ctx.drawImage(image,0,0);ctx.restore();}}
 }
 root.NaiwaJelly={buildSoftMesh,JellyRenderer,positions};if(typeof module!=='undefined'&&module.exports)module.exports=root.NaiwaJelly;
})(typeof window!=='undefined'?window:globalThis);
