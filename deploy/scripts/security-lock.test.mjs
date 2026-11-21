import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../../",import.meta.url);
function read(path){return JSON.parse(readFileSync(new URL(path,root),"utf8"));}
test("Prisma's transitive Effect parser must use the fixed, integrity-pinned release",()=>{
  const pkg=read("package.json"),lock=read("package-lock.json");
  assert.equal(pkg.overrides?.effect,"3.22.1");
  const entries=Object.entries(lock.packages).filter(([key])=>/(?:^|\\/)node_modules\\/effect$/.test(key));
  assert.ok(entries.length>0,"Effect should remain visible to dependency auditing");
  for(const [name,entry] of entries){
    assert.equal(entry.version,"3.22.1",name+" must be fixed");
    assert.equal(entry.resolved,"https://registry.npmjs.org/effect/-/effect-3.22.1.tgz");
    assert.equal(entry.integrity,"sha512-TNoXushmPOBAjJlthF5d2QwnX2xBPEtcNJr5XKNKbRLbDvBcOYkXlYDfvGfSA0zriwLFuCll5MDtNMAdZL17PQ==");
  }
});
