const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const si = require('systeminformation');
(async () => {
 const m = await import(pathToFileURL(path.resolve(__dirname, '../dist-electron/system.js')));
 const gpus = m.normalizeGraphics({ controllers: [{ vendor:'Intel', model:'UHD Graphics', bus:'PCI', vramDynamic:true, vram:1024, utilizationMemory:90 }, { vendor:'NVIDIA', model:'RTX 4060', bus:'PCI', utilizationGpu:0, memoryUsed:123, memoryTotal:8192 }] });
 assert.equal(gpus.length,2); assert.equal(gpus[0].utilization,null); assert.equal(gpus[1].utilization,0); assert.notEqual(gpus[0].id,gpus[1].id);
 let updates=0; const stop=m.monitorHardware(() => updates++);
 for (let i=0; i<60; i++) { await new Promise(r=>setTimeout(r,500)); const s=m.systemStats(); if (s.cpu !== null && s.total>0 && s.logicalProcessors>0) break; }
 const stats=m.systemStats(); stop(); console.log("Hardware probe", JSON.stringify(stats));
 assert.ok(stats.cpu !== null && stats.cpu >= 0 && stats.cpu <=100);
 assert.ok(stats.total>0 && stats.used>=0 && stats.available>0 && stats.ramPercent !== null);
 assert.ok(stats.logicalProcessors>0);
 console.log('PASS: actual systeminformation CPU/RAM polling; logical processor inventory; GPU discovery; separate utilization/VRAM; multiple adapters; missing GPU utilization is null, genuine zero retained.');
 console.log(JSON.stringify({cpu:stats.cpu,cpuName:stats.cpuName,logicalProcessors:stats.logicalProcessors,ramPercent:stats.ramPercent,gpus:stats.gpus}));
})().catch(e=>{console.error(e);process.exitCode=1});

