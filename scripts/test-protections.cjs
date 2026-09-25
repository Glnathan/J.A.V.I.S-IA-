// Tests des fonctions réelles du composant, avec micro/caméra/réseau simulés.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/jarvis/JarvisApp.tsx'), 'utf8');
const ast = ts.createSourceFile('app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function functionText(name) {
  let result;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name && n.initializer) result = n.initializer.getText(ast);
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.ok(result, name);
  return ts.transpileModule(`const fn = ${result};`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText + '\nfn';
}
function harness(overrides = {}) {
  const sent = [], notices = [];
  const box = {
    Date, console, setTimeout, clearTimeout,
    payloadRef: {current:{settings:{voiceGate:true, premiumActive:true, voicePrint:{descriptors:[[1]]}},stt:{available:true}}},
    converseUntilRef:{current:Date.now()+600000}, converseLastAtRef:{current:Date.now()},
    awaitingUntilRef:{current:0}, voiceGateNoticeRef:{current:0}, faceGateNoticeRef:{current:0},
    micReservedRef:{current:false},micDiagnosticRef:{current:false},
    setInterim:()=>{},setStatus:()=>{},setAwaiting:()=>{},setMicError:(s)=>notices.push(s),
    pushNotice:(s)=>notices.push(s),sfx:{success:()=>{},wake:()=>{}},
    foldText:s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    WAKE_RE:/\bjarvis\b/,fns:{current:{send:(s)=>sent.push(s)}},
    visionGateActive:()=>false,verifyWav:async()=>true,transcribe:async()=>({text:'bonjour',suspect:false}),
    stopRecognition:()=>{},startWhisper:()=>{},startBrowserRecognition:()=>true,
    ...overrides,
  };
  vm.createContext(box);
  for(const name of ['converseActive','voiceGateActive','currentEngine','handleWake','handleSegment','startRecognition']) {
    box[name] = vm.runInContext(`(() => { ${functionText(name).replace(/\nfn$/, '\nreturn fn;')} })()`,box);
  }
  return {box,sent,notices};
}
async function main(){
  assert.ok(!source.includes('\x08'),'pas de caractère retour arrière');
  for(const phrase of ['merci','merci beaucoup','stop',"c'est tout",'c’est fini','fin de conversation']){
    const {box,sent}=harness(); await box.handleWake('',phrase,true);
    assert.equal(box.converseUntilRef.current,0,phrase);assert.equal(sent.length,0);
  }
  for(const result of [false,null]){
    let transcriptions=0;const {box,sent,notices}=harness({verifyWav:async()=>result,transcribe:async()=>{transcriptions++;return {text:'ouvre calculatrice'};}});
    await box.handleSegment({},'wake');assert.equal(transcriptions,0);assert.equal(sent.length,0);assert.equal(notices.length,1);
  }
  {const {box,sent}=harness();await box.handleWake('','ouvre calculatrice');assert.equal(sent.length,0,'navigateur sans preuve vocale');}
  {const {box,sent}=harness();await box.handleSegment({},'wake');assert.deepEqual(sent,['bonjour']);}
  {const {box}=harness({transcribe:async()=>({text:'merci',suspect:true})});await box.handleSegment({},'wake');assert.equal(box.converseUntilRef.current,0,'merci filtré par Whisper');}
  {const {box,sent}=harness({transcribe:async()=>({text:"merci d’avoir regardé",suspect:true})});await box.handleSegment({},'wake');assert.equal(sent.length,0);assert.ok(box.converseUntilRef.current>0);}
  {let browserStarted=false;const {box,notices}=harness({startBrowserRecognition:()=>{browserStarted=true;return true;}});box.payloadRef.current.stt.available=false;assert.equal(box.startRecognition('wake'),false);assert.equal(browserStarted,false);assert.equal(notices.length,1);assert.equal(box.startRecognition('ptt'),true);}
  for(const result of [false,null,true]){
    const {box,sent}=harness({visionGateActive:()=>true,checkFaceNow:async()=>result});box.converseUntilRef.current=0;
    await box.handleWake('','Jarvis ouvre calculatrice',true);assert.equal(sent.length,result===true?1:0,'visage '+result);
  }
  // Deux chargements du module simulent un redémarrage, sans toucher aux données réelles.
  const files=new Map();let online=true;
  const readPaths=[];
  const fakeFs={readFile:async p=>{readPaths.push(p);if(!files.has(p))throw Error('ENOENT');return files.get(p);},writeFile:async(p,s)=>files.set(p,s)};
  const satelliteJs=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/satellites.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  function satellites(){const box={exports:{},Date,AbortSignal,fetch:async()=>{if(!online)throw Error('offline');return {ok:true,json:async()=>[{NORAD_CAT_ID:25544,EPOCH:'2026-09-25T00:00:00',OBJECT_NAME:'ISS (ZARYA)'}]};},require:n=>n==='node:fs/promises'?fakeFs:n==='node:path'?path:n==='./runtime'?{dataDir:()=>'/data',resourcesDir:()=>'/resources'}:{}};vm.runInNewContext(satelliteJs,box);return box.exports;}
  const first=satellites();assert.equal((await first.fetchTles()).length,1);assert.ok(files.has(path.join('/data','space-orbits.json')));
  online=false;const restarted=satellites();assert.equal((await restarted.fetchTles())[0].name,'ISS (ZARYA)');assert.equal(restarted.catalogueInfo().stale,true);
  assert.ok(readPaths.includes(path.join('/data','space-orbits.json')));
  files.set(path.join('/data','space-orbits-active.json'),files.get(path.join('/data','space-orbits.json')));files.delete(path.join('/data','space-orbits.json'));
  assert.equal((await satellites().fetchTles()).length,1,'compatibilité ancien cache');
  console.log('PASS : arrêts vocaux, refus voix non vérifiée, Whisper indisponible, caméra refusée, commandes valides, cache après redémarrage et cache historique.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
