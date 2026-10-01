import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { decodePcm } from "../app/dev/voice-test/pcm.js";
import { POST } from "../app/api/tts-test/route.js";

test("PCM retains split int16 bytes, including signed extrema", () => {
  const bytes = new Uint8Array([0,128,255,127,0,0,1,0,255,255]);
  for (let split=0; split<=bytes.length; split++) {
    const a=decodePcm(bytes.slice(0,split),null),b=decodePcm(bytes.slice(split),a.remainder);
    assert.deepEqual([...a.samples,...b.samples],[-1,32767/32768,0,1/32768,-1/32768]); assert.equal(b.remainder,null);
  }
});
async function processor(rate=48000) {
  const messages=[];let Class;
  const context=vm.createContext({AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)}}},registerProcessor:(_name,C)=>{Class=C},sampleRate:rate,currentTime:0});
  vm.runInContext(await readFile(new URL("../public/tts-test/pcm-worklet.js",import.meta.url),"utf8"),context);
  const p=new Class();return {p,messages,context,send:data=>p.port.onmessage({data}),render:()=>{const output=new Float32Array(128);p.process([],[[output]]);context.currentTime+=128/rate;return output;}};
}
test("worklet streams before EOF, resamples 24 to 48 kHz, stops and rejects stale chunks", async()=>{
  const t=await processor();t.send({type:"start",id:1});t.send({type:"pcm",id:1,samples:new Float32Array(4800).fill(.25)});
  assert.equal(t.render()[0],.25);assert(t.messages.some(m=>m.type==="first"));
  t.send({type:"stop",id:1});t.send({type:"pcm",id:1,samples:new Float32Array(9000).fill(.5)});
  assert(t.render().every(v=>v===0));assert.equal(t.p.available,0);
  t.send({type:"start",id:2});t.send({type:"pcm",id:2,samples:new Float32Array(4800).fill(.25)});t.send({type:"end",id:2});
  let audible=0;for(let i=0;i<100;i++)audible+=t.render().filter(v=>v!==0).length;
  assert.equal(audible,9600);assert(t.messages.some(m=>m.type==="done"&&m.id===2));
});
test("short stream drains at EOF below initial buffer; underrun counts episodes",async()=>{
  const t=await processor(24000);t.send({type:"start",id:1});t.send({type:"pcm",id:1,samples:new Float32Array(32).fill(.5)});
  assert(t.render().every(v=>v===0));t.send({type:"end",id:1});assert.equal(t.render().filter(v=>v!==0).length,32);
  t.send({type:"start",id:2});t.send({type:"pcm",id:2,samples:new Float32Array(4000).fill(.5)});
  for(let i=0;i<50;i++)t.render();assert.equal(t.p.underruns,1);
});
test("route reports missing server key without making an API call",async()=>{
  const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  try{const r=await POST(new Request("http://localhost/api/tts-test",{method:"POST",body:JSON.stringify({text:"Привіт"})}));assert.equal(r.status,503);}finally{if(old!==undefined)process.env.OPENAI_API_KEY=old;}
});
test("route forwards the first PCM chunk before upstream completion and cancels upstream",async()=>{
  const oldKey=process.env.OPENAI_API_KEY,oldFetch=globalThis.fetch;process.env.OPENAI_API_KEY="unit-test-only";let upstreamSignal,cancelled=false,release;
  try{
    globalThis.fetch=async(_url,options)=>{upstreamSignal=options.signal;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));release=()=>{c.enqueue(new Uint8Array([3,4]));c.close();}},cancel(){cancelled=true;}},{highWaterMark:0}));};
    const r=await POST(new Request("http://localhost/api/tts-test",{method:"POST",body:JSON.stringify({text:"Привіт"})}));assert.equal(r.status,200);assert(r.headers.has("X-TTS-First-Byte-Ms"));
    const reader=r.body.getReader();assert.deepEqual([...((await reader.read()).value)],[1,2]);assert.equal(upstreamSignal.aborted,false);assert.equal(typeof release,"function");
    await reader.cancel();assert(upstreamSignal.aborted);assert(cancelled);
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
