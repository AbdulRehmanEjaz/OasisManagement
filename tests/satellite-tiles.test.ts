import test from "node:test";
import assert from "node:assert/strict";
import { satelliteTileRegion, satelliteTileUrl } from "../src/lib/satellite-tiles";
test("Missing satellite tiles request an error instead of a grey placeholder", () => {
  assert.match(satelliteTileUrl(19, 12, 15), /tile\/19\/15\/12\?blankTile=false$/);
});
test("Ancestor imagery crops preserve the requested geographic tile", () => {
  assert.deepEqual(satelliteTileRegion(21, 30, 19, 17), {x:5,y:7,z:17,left:64,top:128,size:64});
  assert.deepEqual(satelliteTileRegion(21, 30, 19, 19), {x:21,y:30,z:19,left:0,top:0,size:256});
  assert.deepEqual(satelliteTileRegion(23, 31, 19, 17), {x:5,y:7,z:17,left:192,top:192,size:64});
});
