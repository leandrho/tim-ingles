import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('emily-canvas');
const slide = document.getElementById('emily');

// debug overlay
function addDebug(msg, color='#8ec7ff'){
  let el=document.getElementById('emily-debug');
  if(!el){
    el=document.createElement('div');
    el.id='emily-debug';
    el.style.cssText='position:absolute;left:12px;top:12px;z-index:5;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.15);font:11px/1.3 monospace;color:'+color+';pointer-events:none;max-width:70%';
    slide?.appendChild(el);
  }
  el.textContent=msg;
  el.style.color=color;
  console.log('[Emily]',msg);
}

if (!canvas || !slide) {
  console.warn('Emily slide not found');
} else {
try{
addDebug('Three r'+THREE.REVISION+' • init…');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a1628, 0.034);
scene.background = new THREE.Color(0x080b16);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
camera.position.set(0, 1.45, 7.4);

const ambient = new THREE.AmbientLight(0x8ec7ff, 0.62);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0xcfe6ff, 1.45);
moon.position.set(3.2, 6.5, 4.2);
moon.castShadow = true;
moon.shadow.mapSize.set(1024,1024);
scene.add(moon);
const fill = new THREE.PointLight(0x6ba8ff, 0.85, 20);
fill.position.set(-2.2, 2.4, 2.2);
scene.add(fill);
const rim = new THREE.PointLight(0xa9d1ff, 0.65, 14);
rim.position.set(0, 1.3, -3.2);
scene.add(rim);
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.85,16,12), new THREE.MeshStandardMaterial({color:0xcfe6ff, emissive:0x8ec7ff, emissiveIntensity:0.45, transparent:true, opacity:0.9}));
moonMesh.position.set(4.5, 5.8, -8);
scene.add(moonMesh);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60,60), new THREE.MeshStandardMaterial({ color: 0x0d1426, roughness: 0.96, metalness: 0.02 }));
ground.rotation.x = -Math.PI/2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

const treeGroup = new THREE.Group();
function addTree(x,z,scale=1){
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08*scale,0.12*scale,1.8*scale,6), new THREE.MeshStandardMaterial({color:0x0e1a30, roughness:0.92}));
  trunk.position.set(x,0.9*scale,z); trunk.castShadow=true;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55*scale,1.4*scale,6), new THREE.MeshStandardMaterial({color:0x0f1f38, roughness:0.86}));
  cone.position.set(x,2.1*scale,z); cone.castShadow=true;
  treeGroup.add(trunk,cone);
}
for(let i=0;i<28;i++){
  const side=i%2===0?-1:1;
  addTree(side*(2.2+Math.random()*2.8), -i*1.8+(Math.random()-0.5)*0.8, 0.9+Math.random()*0.7);
}
for(let i=0;i<4;i++) addTree((Math.random()-0.5)*12,-8-i*4-Math.random()*2,1.6);
scene.add(treeGroup);

const butterflies=[];
const bGeo=new THREE.PlaneGeometry(0.18,0.12);
for(let i=0;i<10;i++){
  const m=new THREE.MeshStandardMaterial({color:0xb8d6ff, emissive:0x8ec7ff, emissiveIntensity:0.95, transparent:true, opacity:0.92, side:THREE.DoubleSide});
  const b=new THREE.Mesh(bGeo,m);
  b.position.set((Math.random()-0.5)*5,0.7+Math.random()*1.6,(Math.random()-0.5)*5-1);
  b.userData={baseY:b.position.y, baseX:b.position.x, speed:0.7+Math.random()*0.9, amp:0.25+Math.random()*0.35};
  const glow=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,6), new THREE.MeshStandardMaterial({color:0x8ec7ff, emissive:0x8ec7ff, emissiveIntensity:1.2}));
  b.add(glow);
  scene.add(b);
  butterflies.push(b);
}
const fogDots=[];
for(let i=0;i<7;i++){
  const f=new THREE.Mesh(new THREE.SphereGeometry(0.38,6,6), new THREE.MeshStandardMaterial({color:0xcfe1ff, transparent:true, opacity:0.07}));
  f.position.set((Math.random()-0.5)*8,0.35+Math.random()*1.1,(Math.random()-0.5)*8);
  f.scale.set(1+Math.random()*1.4,0.55,1);
  scene.add(f);
  fogDots.push(f);
}

const brideWrapper=new THREE.Group();
scene.add(brideWrapper);

let mixer=null;
let brideModel=null;
let glbLoaded=false;

// Procedural fallback builder (full Emily if GLB fails, especially file://)
function buildFallbackEmily(){
  if(brideWrapper.children.length>0) return;
  addDebug('GLB not loaded — using procedural fallback (run via http server for GLB)', '#ffd6e0');
  const g=new THREE.Group();
  const skinMat=new THREE.MeshStandardMaterial({color:0xe6eef8, roughness:0.45, emissive:0x6ba8ff, emissiveIntensity:0.06});
  const dressMat=new THREE.MeshStandardMaterial({color:0xf2f6ff, roughness:0.6, side:THREE.DoubleSide});
  const veilMat=new THREE.MeshStandardMaterial({color:0xeaf2ff, transparent:true, opacity:0.38, side:THREE.DoubleSide});
  const hairMat=new THREE.MeshStandardMaterial({color:0x1a2a44});
  const boneMat=new THREE.MeshStandardMaterial({color:0xeef6ff});
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.33,20,16), skinMat); head.position.y=1.62; head.scale.set(1,1.18,0.92); g.add(head);
  const eyeMat=new THREE.MeshStandardMaterial({color:0x0a1628});
  const eyeL=new THREE.Mesh(new THREE.SphereGeometry(0.075,12,8), eyeMat); eyeL.position.set(-0.11,1.62,0.21); eyeL.scale.set(1,1,0.5); g.add(eyeL);
  const eyeR=eyeL.clone(); eyeR.position.x=0.11; g.add(eyeR);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(0.032,8,6), new THREE.MeshStandardMaterial({color:0x8ec7ff, emissive:0x8ec7ff, emissiveIntensity:1.2})); glow.position.set(-0.11,1.625,0.26); g.add(glow); const glow2=glow.clone(); glow2.position.x=0.11; g.add(glow2);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(0.36,16,12), hairMat); hair.position.set(0,1.75,-0.06); hair.scale.set(1.08,0.7,1); g.add(hair);
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.24,0.42,12), dressMat); torso.position.y=1.12; g.add(torso);
  const dress=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.86,1.35,14,4,true), dressMat); dress.position.y=0.28; g.add(dress);
  // legs for walk anim
  const legGeo=new THREE.CylinderGeometry(0.07,0.06,0.62,8);
  const legL=new THREE.Mesh(legGeo, skinMat); legL.position.set(-0.14,-0.06,0); g.add(legL);
  const legR=legL.clone(); legR.position.x=0.14; g.add(legR);
  legL.name='legL'; legR.name='legR';
  // arms
  const armGeo=new THREE.CylinderGeometry(0.06,0.05,0.48,8);
  const armL=new THREE.Mesh(armGeo, skinMat); armL.position.set(-0.28,1.05,0); g.add(armL); armL.name='armL';
  const armR=armL.clone(); armR.position.x=0.28; g.add(armR); armR.name='armR';
  const veilGeo=new THREE.PlaneGeometry(1.15,1.55,8,8); const veil=new THREE.Mesh(veilGeo, veilMat); veil.position.set(0,0.95,-0.32); g.add(veil); veil.name='veil';
  dress.name='dress';
  // store refs for anim
  g.userData={legL,legR,armL,armR,dress,veil,veilGeo};
  brideWrapper.add(g);
  brideWrapper.userData.isFallback=true;
}

// Detect file://
if(location.protocol==='file:'){
  addDebug('Abriendo como file:// — el GLB no cargará por CORS. Usa: python -m http.server 8000', '#ffb3c1');
}

const loader=new GLTFLoader();
let loadTimeout=setTimeout(()=>{
  if(!glbLoaded) {
    console.warn('GLB timeout, building fallback');
    buildFallbackEmily();
  }
}, 2500);

loader.load('assets/undead-bride-threejs.glb',
  (gltf)=>{
    clearTimeout(loadTimeout);
    glbLoaded=true;
    addDebug('GLB loaded ✓ — '+gltf.animations.length+' clips');
    brideModel=gltf.scene;
    try{
      const box=new THREE.Box3().setFromObject(brideModel);
      const size=new THREE.Vector3(); box.getSize(size);
      const center=new THREE.Vector3(); box.getCenter(center);
      const targetH=2.15;
      const scale=targetH / Math.max(size.y, 0.1);
      brideModel.scale.setScalar(Math.min(scale, 1.2));
      brideModel.position.sub(center.clone().multiplyScalar(brideModel.scale.x));
      const box2=new THREE.Box3().setFromObject(brideModel);
      brideModel.position.y -= box2.min.y;
    }catch(e){ console.warn(e); }
    brideModel.traverse(o=>{
      if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; if(o.material) o.material.needsUpdate=true; }
    });
    brideWrapper.add(brideModel);
    if(gltf.animations && gltf.animations.length){
      mixer=new THREE.AnimationMixer(brideModel);
      gltf.animations.forEach(clip=>{
        const a=mixer.clipAction(clip);
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.play();
        a.timeScale=0.92;
      });
      brideWrapper.rotation.y = -Math.PI/2;
    } else {
      addDebug('GLB sin animación, usando bob', '#ffd6e0');
    }
  },
  (xhr)=>{
    if(xhr.lengthComputable){
      addDebug('Cargando GLB ' + Math.round(xhr.loaded/xhr.total*100)+'%');
    }
  },
  (err)=>{
    clearTimeout(loadTimeout);
    console.error('GLB error',err);
    addDebug('Error GLB: '+ (err.message||err) + ' — fallback', '#ff8fa0');
    buildFallbackEmily();
  }
);

let t=0;
let visible=true;
let rafId=null;
const clock=new THREE.Clock();

function resize(){
  const w=slide.clientWidth;
  const h=slide.clientHeight;
  // guard against 0 size before layout
  if(w<10 || h<10){ setTimeout(resize, 200); return; }
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);
// also observe slide resize
try{ new ResizeObserver(resize).observe(slide); }catch(e){}

const prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const obs=new IntersectionObserver(entries=>{
  entries.forEach(ent=>{
    visible=ent.isIntersecting && ent.intersectionRatio>0.08;
    if(visible && !rafId) { clock.getDelta(); loop(); addDebug('visible → play'); }
  });
},{threshold:[0,0.08,0.5]});
obs.observe(slide);

// ensure visible initially if slide in view
setTimeout(()=>{ if(!rafId) { visible=true; loop(); } }, 600);

function loop(){
  if(!visible){ rafId=null; return; }
  rafId=requestAnimationFrame(loop);
  const delta=Math.min(clock.getDelta(),0.05);
  t+=delta;

  if(mixer) mixer.update(delta * (prefersReduced?0.25:1));

  // Fallback procedural walk anim if no mixer
  if(brideWrapper.userData.isFallback){
    const walk=Math.sin(t*2.0);
    const walk2=Math.cos(t*2.0);
    const g=brideWrapper.children[0];
    if(g && g.userData.legL){
      const {legL,legR,armL,armR,dress,veil,veilGeo}=g.userData;
      brideWrapper.position.y = Math.abs(walk)*0.03;
      legL.rotation.x = walk*0.55; legR.rotation.x = -walk*0.55;
      armL.rotation.x = -walk*0.45+0.22; armR.rotation.x = walk*0.45+0.22;
      if(dress) dress.rotation.z = walk*0.04;
      if(veil && veilGeo){
        const pos=veilGeo.attributes.position;
        for(let i=0;i<pos.count;i++){
          const x=pos.getX(i), y=pos.getY(i);
          pos.setZ(i, Math.sin(y*2.2 + t*1.1 + x*1.5)*0.07);
        }
        pos.needsUpdate=true;
      }
    }
  } else {
    brideWrapper.position.y = Math.abs(Math.sin(t*1.6))*0.012;
  }

  butterflies.forEach((b,i)=>{
    const d=b.userData;
    b.position.y=d.baseY + Math.sin(t*d.speed + i)*d.amp;
    b.position.x=d.baseX + Math.cos(t*0.32 + i*0.7)*0.55;
    b.position.z += 0.007;
    if(b.position.z>5) b.position.z=-6-Math.random()*2;
    b.lookAt(camera.position);
    b.scale.x = Math.sin(t*13 + i*2.2)*0.16+1;
  });
  fogDots.forEach((f,i)=>{
    f.position.x += Math.sin(t*0.11 + i)*0.0025;
    f.material.opacity = 0.055 + Math.sin(t*0.28 + i)*0.022;
  });

  const cycle=(t % 15)/15;
  const dolly = cycle * 1.35;
  camera.position.z = 7.0 + dolly;
  camera.position.y = 1.48 + Math.sin(t*0.7)*0.018;
  camera.position.x = Math.sin(t*0.18)*0.12;
  camera.lookAt(0, 0.95, -0.3 + cycle*0.2);
  treeGroup.position.z = (cycle - 0.5)*0.9;
  moonMesh.position.x = 4.5 + Math.sin(t*0.05)*0.3;

  renderer.render(scene, camera);
}
// start
loop();

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) visible=false;
  else { visible=true; clock.getDelta(); if(!rafId) loop(); }
});

}catch(err){
  addDebug('Error fatal: '+err.message, '#ff4d6d');
  console.error(err);
}
}
