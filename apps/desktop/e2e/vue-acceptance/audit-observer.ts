/** Node API 层观察，不替代操作系统调用跟踪；在网络守卫之后加载。 */
export const AUDIT_OBSERVER = String.raw`
const fs = require('node:fs');
const moduleAPI = require('node:module');
const emit = (record) => process.stderr.write('VUE_AUDIT ' + JSON.stringify({pid:process.pid,...record}) + '\n');
for (const name of ['readFileSync','readdirSync','statSync','lstatSync','realpathSync','accessSync','openSync','writeFileSync','appendFileSync','mkdirSync','renameSync','unlinkSync']) {
  const original = fs[name];
  const wrapped = function(...args) {
    const file = typeof args[0] === 'number' ? 'fd:'+args[0] : String(args[0]);
    try { const result = original.apply(this,args); emit({kind:'fs',name,file,ok:true}); return result; }
    catch(error) { emit({kind:'fs',name,file,ok:false,code:error.code}); throw error; }
  };
  Object.assign(wrapped, original);
  fs[name] = wrapped;
}
for (const name of ['readFile','readdir','stat','lstat','realpath','access','open','writeFile','appendFile','mkdir','rename','unlink']) {
  const original = fs.promises[name];
  fs.promises[name] = async function(...args) {
    const file = String(args[0]);
    try { const result = await original.apply(this,args); emit({kind:'fs-promises',name,file,ok:true}); return result; }
    catch(error) { emit({kind:'fs-promises',name,file,ok:false,code:error.code}); throw error; }
  };
}
for (const name of ['net','tls','http','https','http2','dgram','dns','dns/promises']) {
  const api = require('node:'+name);
  for (const method of ['connect','createConnection','request','get','createSocket','lookup','resolve','resolve4']) {
    const original = api[method];
    if (typeof original !== 'function') continue;
    api[method] = function(...args) { emit({kind:'network',name,method}); return original.apply(this,args); };
  }
}
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (...args) => { emit({kind:'network',name:'fetch'}); return fetchOriginal(...args); };
moduleAPI.syncBuiltinESMExports();
emit({kind:'ready'});
`;
