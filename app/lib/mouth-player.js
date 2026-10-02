/* Geometric morph of accepted patches; cues follow AudioContext, tracking follows idle video. */
function triangulate(points) {
  const p=points.concat([[-10000,-10000],[10000,-10000],[0,10000]]), n=points.length;
  let triangles=[[n,n+1,n+2]];
  function inside(t, q) {
    const [a,b,c]=t.map(i=>p[i]), ax=a[0]-q[0], ay=a[1]-q[1], bx=b[0]-q[0], by=b[1]-q[1], cx=c[0]-q[0], cy=c[1]-q[1];
    const det=(ax*ax+ay*ay)*(bx*cy-by*cx)-(bx*bx+by*by)*(ax*cy-ay*cx)+(cx*cx+cy*cy)*(ax*by-ay*bx);
    const orientation=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    return det*orientation>1e-8;
  }
  for(let i=0;i<n;i++) {
    const edges=new Map(), kept=[];
    for(const t of triangles) {
      if(!inside(t,p[i])){kept.push(t);continue}
      for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
    }
    for(const edge of edges.values())kept.push([...edge,i]);
    triangles=kept;
  }
  return triangles.filter(t=>t.every(i=>i<n));
}

function lipMask(x,y,polygon) {
  let inside=false,distance=Infinity;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,ay]=polygon[j],[bx,by]=polygon[i];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)):0;
    distance=Math.min(distance,Math.hypot(x-ax-t*dx,y-ay-t*dy));
  }
  if(inside||distance<=3)return 1;
  const t=Math.min(1,(distance-3)/17);
  return 1-t*t*(3-2*t);
}

function renderMorph(weights, config, textures, destination) {
  const points=config.outer_lip_points.map((outer,i)=>config.fixed_mesh_points.concat(outer,config.inner_mouth_points[i]));
  const target=points[0].map((_,j)=>[0,1].map(axis=>weights.reduce((sum,w,i)=>sum+w*points[i][j][axis],0)));
  const triangles=triangulate(target), data=destination.data, width=120, height=60;
  const outer=target.slice(config.fixed_mesh_points.length,config.fixed_mesh_points.length+config.outer_lip_points[0].length);
  data.fill(0);
  const used=weights.map((w,i)=>[w,i]).filter(([w])=>w>0.00001);
  for(const indices of triangles){
    const [a,b,c]=indices.map(i=>target[i]);
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
    const xmin=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])/2)),xmax=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])/2));
    const ymin=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])/2)),ymax=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])/2));
    for(let py=ymin;py<=ymax;py++)for(let px=xmin;px<=xmax;px++){
      const x=px*2,y=py*2;
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;
      const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;
      if(u< -1e-6||v< -1e-6||w< -1e-6)continue;
      const rgb=[0,0,0];
      for(const [weight,i] of used){
        const src=indices.map(j=>points[i][j]);
        const sx=Math.max(0,Math.min(239,u*src[0][0]+v*src[1][0]+w*src[2][0]));
        const sy=Math.max(0,Math.min(119,u*src[0][1]+v*src[1][1]+w*src[2][1]));
        const xx=Math.floor(sx),yy=Math.floor(sy),fx=sx-xx,fy=sy-yy,tex=textures[i];
        const offsets=[(yy*240+xx)*4,(yy*240+Math.min(239,xx+1))*4,(Math.min(119,yy+1)*240+xx)*4,(Math.min(119,yy+1)*240+Math.min(239,xx+1))*4];
        for(let channel=0;channel<3;channel++)rgb[channel]+=weight*(tex[offsets[0]+channel]*(1-fx)*(1-fy)+tex[offsets[1]+channel]*fx*(1-fy)+tex[offsets[2]+channel]*(1-fx)*fy+tex[offsets[3]+channel]*fx*fy);
      }
      const offset=(py*width+px)*4;data[offset]=rgb[0];data[offset+1]=rgb[1];data[offset+2]=rgb[2];
      // Cover both moving and resting lips; blend only a narrow curved skin margin.
      const mask=Math.max(lipMask(x,y,outer),lipMask(x,y,config.outer_lip_points[0]));
      data[offset+3]=255*mask*Math.max(0,Math.min(1,x/6,(239-x)/6,y/6,(119-y)/6));
    }
  }
}

export class MouthPlayer {
  constructor({canvas,idle,thinking,onError}){
    this.version='lips-20261002c';
    this.ready=false;this.weights=[1,0,0,0,0,0,0];this.audio=null;this.spans=[];this.last=performance.now();this.release=null;
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.idle=idle;this.state='idle';this.disposed=false;
    this.thinking=thinking;this.background='idle';this.transition=null;
    for(const video of [idle,thinking])video.play().catch(()=>{});
    this.hold=document.createElement('canvas');this.hold.width=768;this.hold.height=960;this.holdCtx=this.hold.getContext('2d');this.hasFrame=false;
    this.patch=document.createElement('canvas');this.patch.width=120;this.patch.height=60;this.patchCtx=this.patch.getContext('2d');this.pixels=this.patchCtx.createImageData(120,60);this.lastMorph=-Infinity;
    this.livePatch=document.createElement('canvas');this.livePatch.width=120;this.livePatch.height=60;this.liveCtx=this.livePatch.getContext('2d',{willReadFrequently:true});
    this.initialize().catch(()=>{if(!this.disposed)onError('Не вдалося завантажити аватар. Оновіть сторінку.');});
    this.raf=requestAnimationFrame(now=>this.frame(now));
  }
  async initialize(){
    const response=await fetch('/teachers/alina/live/avatar.json?v=20261002c');if(!response.ok)throw Error('avatar.json');this.config=await response.json();
    this.textures=await Promise.all(Array.from({length:7},(_,i)=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=240;c.height=120;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);resolve(ctx.getImageData(0,0,240,120).data)};image.onerror=()=>reject(Error('mouth-'+i));image.src='/teachers/alina/live/mouth-'+i+'.png?v=20261002c';
    })));
    const mapping=await fetch('/teachers/alina/live/transitions.json');if(!mapping.ok)throw Error('transitions');this.transitionMap=await mapping.json();
    if(!this.disposed)this.ready=true;
  }
  setState(state){
    const old=this.state;this.state=state;
    if(old===state||!this.transitionMap)return;
    const from=old==='thinking'?this.thinking:this.idle,to=state==='thinking'?this.thinking:this.idle;
    if(from!==to&&to.readyState>=1){
      const map=state==='thinking'?this.transitionMap.idleToThinking:this.transitionMap.thinkingToIdle;
      to.currentTime=map[Math.floor(from.currentTime*this.transitionMap.fps)%map.length]/this.transitionMap.fps;
    }
  }
  destroy(){this.disposed=true;cancelAnimationFrame(this.raf);this.idle.pause();this.thinking.pause();}
  begin(audio,spans){this.audio=audio;this.spans=spans;this.release=null;this.weights=[1,0,0,0,0,0,0];}
  close(){this.audio=null;this.spans=[];this.release={at:performance.now(),from:this.weights.slice()};}
  async waitForSpeech(signal){
    const deadline=performance.now()+5000;
    while(this.background!=='idle'||this.transition||!this.hasFrame||this.idle.seeking){
      if(this.disposed||signal.aborted)throw new DOMException('Aborted','AbortError');
      if(performance.now()>deadline)throw Error('Не вдалося підготувати кадр аватара');
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
  }
  drawBackground(now){
    const desired=this.state==='thinking'?'thinking':'idle';
    if(desired!==(this.transition?.target??this.background)){
      this.holdCtx.clearRect(0,0,768,960);this.holdCtx.drawImage(this.canvas,0,0);
      this.transition={target:desired,at:null};
    }
    const target=this.transition?.target??this.background,video=target==='thinking'?this.thinking:this.idle;
    // Keep the last complete image while seeking/decoding. No empty or black frame.
    if(video.readyState<2||video.seeking)return false;
    const ctx=this.ctx;ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
    if(this.transition&&this.hasFrame){
      this.transition.at??=now;
      const t=Math.min(1,(now-this.transition.at)/500),ease=t*t*(3-2*t);
      ctx.drawImage(this.hold,0,0);ctx.globalAlpha=ease;ctx.drawImage(video,0,0,768,960);ctx.globalAlpha=1;
      if(t===1){this.background=target;this.transition=null;}
    }else{ctx.drawImage(video,0,0,768,960);this.background=target;this.transition=null;}
    this.hasFrame=true;
    return this.background==='idle'&&!this.transition;
  }
  frame(now){
    const dt=Math.min(0.1,Math.max(0,(now-this.last)/1000));this.last=now;
    const ctx=this.ctx,canDrawMouth=this.drawBackground(now);
    if(this.ready){
      let shape=0;
      if(this.audio){const t=this.audio.currentTime;const span=this.spans.find(s=>t>=s.start&&t<s.end);if(span){const cue=span.cues.find(c=>t-span.start>=c.start&&t-span.start<c.end);shape=this.config.rhubarb_mapping[cue?.value]??0;}}
      if(this.release){const a=Math.min(1,(now-this.release.at)/240),ease=a*a*(3-2*a);this.weights=this.release.from.map((w,i)=>w*(1-ease)+(i===0?ease:0));if(a===1)this.release=null;}
      else {const tau=shape===0?this.config.release_seconds:this.config.attack_seconds,alpha=1-Math.exp(-dt/tau);this.weights=this.weights.map((w,i)=>w+((i===shape?1:0)-w)*alpha);}
      const opacity=Math.min(1,(1-this.weights[0])*6);
      if(opacity>0.003&&canDrawMouth){
        const frame=this.idle.currentTime*this.config.fps,index=Math.floor(frame)%this.config.tracking.length,next=(index+1)%this.config.tracking.length,fraction=frame-Math.floor(frame);
        const pose=this.config.tracking[index].map((v,i)=>v*(1-fraction)+this.config.tracking[next][i]*fraction);
        const [dx,dy,angle,scale]=pose,c=Math.cos(angle)*(1+scale),s=Math.sin(angle)*(1+scale),ratio=768/1122,pivotX=458,pivotY=366;
        const tx=pivotX+dx*2-c*pivotX+s*pivotY,ty=pivotY+dy*2-s*pivotX-c*pivotY;
        if(now-this.lastMorph>=1000/24&&this.idle.readyState>=2){
          renderMorph(this.weights,this.config,this.textures,this.pixels);
          // Read the same tracked patch and match surrounding skin colours.
          const a=c*ratio,b=s*ratio,det=a*a+b*b;
          this.liveCtx.setTransform(a/det/2,-b/det/2,b/det/2,a/det/2,(-a*tx-b*ty)/det/2-275,(b*tx-a*ty)/det/2-237.5);
          this.liveCtx.drawImage(this.idle,0,0,768,960);
          const live=this.liveCtx.getImageData(0,0,120,60).data;
          matchVideoColour(this.pixels.data,live);
          this.patchCtx.putImageData(this.pixels,0,0);this.lastMorph=now;
        }
        ctx.globalAlpha=opacity;ctx.setTransform(c*ratio,s*ratio,-s*ratio,c*ratio,tx,ty);ctx.drawImage(this.patch,550,475,240,120);ctx.globalAlpha=1;
      }
    }
    if(!this.disposed)this.raf=requestAnimationFrame(t=>this.frame(t));
  }
}
function matchVideoColour(morph,live){
  // Skin strips above and below every lip shape; exclude the lip pixels from
  // estimation so the resting mouth cannot leave a second outline.
  const offsets=[[0,0,0],[0,0,0]],counts=[0,0];
  for(let band=0;band<2;band++)for(let y=band?51:4;y<(band?57:9);y++)for(let x=20;x<95;x++){
    const k=(y*120+x)*4;counts[band]++;
    for(let ch=0;ch<3;ch++)offsets[band][ch]+=live[k+ch]-morph[k+ch];
  }
  for(let band=0;band<2;band++)for(let ch=0;ch<3;ch++)offsets[band][ch]=Math.max(-32,Math.min(32,offsets[band][ch]/counts[band]));
  for(let y=0;y<60;y++)for(let x=0;x<120;x++){
    const dst=(y*120+x)*4,t=Math.max(0,Math.min(1,(y-6)/47.5));
    for(let ch=0;ch<3;ch++)morph[dst+ch]+=offsets[0][ch]*(1-t)+offsets[1][ch]*t;
  }
}
